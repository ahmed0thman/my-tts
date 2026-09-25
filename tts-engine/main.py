import os

# HuggingFace's xet transfer stalls indefinitely on some repos (observed on
# NAMAA-Saudi-TTS: 0 bytes in 10 minutes, then 2.1GB in 175s with it off).
# Set before any huggingface_hub import so it takes effect.
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

import time
import asyncio
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
import torchaudio
import shutil
import io

import json

import model_registry
import progress
from model_manager import ModelManager
from audio_utils import (
    DEFAULT_MAX_REFERENCE_SECONDS,
    generate_unique_filename,
    save_uploaded_file,
    validate_audio_file,
    get_audio_duration,
    normalize_peak,
    resolve_output_dir,
    merge_clips,
    safe_export_name,
    list_directories,
    build_shortcuts,
)

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="NAMAA Egyptian TTS API")

# No CORS middleware: the engine listens on a Unix domain socket (see
# ENGINE_SOCKET below), which a browser cannot reach at all. Only server-side
# callers — the Next.js server, the Electron supervisor — ever talk to it.

model_manager = ModelManager()

# Directories
# SAWTAK_DATA_ROOT points at the folder holding storage/ — the desktop app sets
# it to ~/Library/Application Support/Sawtak, where the engine code (inside the
# .app) and the data are nowhere near each other. Unset, this is a checkout and
# storage/ sits next to tts-engine/.
DATA_ROOT = os.environ.get("SAWTAK_DATA_ROOT") or os.path.join(os.path.dirname(__file__), "..")
STORAGE_DIR = os.path.abspath(os.path.join(DATA_ROOT, "storage"))
AUDIO_DIR = os.path.join(STORAGE_DIR, "audio")
VOICES_DIR = os.path.join(STORAGE_DIR, "voice-samples")

START_TIME = time.time()

# The engine serves HTTP over a Unix domain socket, not a TCP port. Ports 8000
# and 3000 collided with half the other projects on the machine, and no number
# is ever guaranteed free; a socket file cannot collide with anything, and it
# is reachable only by this user (its directory is created 0700 — uvicorn
# chmods the socket itself to 0666, so the directory is the real guard).
# Every launcher (scripts/dev.sh, electron/processes.js) and the Next client
# (src/lib/tts-client.ts) derive the same default; SAWTAK_ENGINE_SOCKET
# overrides it everywhere.
ENGINE_SOCKET = os.environ.get("SAWTAK_ENGINE_SOCKET") or os.path.join(STORAGE_DIR, "run", "engine.sock")

@app.on_event("startup")
async def startup_event():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    os.makedirs(VOICES_DIR, exist_ok=True)
    asyncio.create_task(model_manager.load_model())

@app.post("/api/generate")
async def generate_audio(
    text: str = Form(...),
    model_id: str = Form(model_registry.DEFAULT_MODEL_ID),
    voice_profile_path: Optional[str] = Form(None),
    reference_text: Optional[str] = Form(None),
    params: Optional[str] = Form(None),
    output_dir: Optional[str] = Form(None)
):
    if not model_registry.is_valid(model_id):
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model '{model_id}'. Known: {', '.join(model_registry.MODEL_IDS)}",
        )

    if voice_profile_path and not os.path.exists(voice_profile_path):
        raise HTTPException(status_code=400, detail="Voice profile path does not exist")

    # Parameter names differ per backend, so they arrive as a JSON blob and the
    # engine adapter picks out the keys it understands.
    try:
        parsed_params = json.loads(params) if params else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="params must be a JSON object")

    # Only SILMA clones from clip + transcription; Chatterbox uses audio alone.
    model_info = next(m for m in model_registry.describe_all(model_manager.device) if m["id"] == model_id)
    if model_info["requiresReferenceText"] and voice_profile_path and not (reference_text or "").strip():
        raise HTTPException(
            status_code=400,
            detail=f"reference_text is required by '{model_id}' when a voice profile is used",
        )

    # Resolve the user-chosen save folder before spending time on inference
    try:
        target_dir = resolve_output_dir(output_dir, AUDIO_DIR)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        wav_tensor, sample_rate, used_seed = await model_manager.generate(
            text=text,
            model_id=model_id,
            audio_prompt_path=voice_profile_path,
            reference_text=reference_text,
            params=parsed_params
        )
        
        # Save to file
        filename = generate_unique_filename("gen", ".wav")
        filepath = os.path.join(AUDIO_DIR, filename)
        
        # Save tensor to wav
        # Add batch dimension if missing for torchaudio
        if wav_tensor.dim() == 1:
            wav_tensor = wav_tensor.unsqueeze(0)

        # Guard against clipping: the model peaks slightly above full scale
        wav_tensor, peak, was_normalized = normalize_peak(wav_tensor)
        if was_normalized:
            logger.info(f"Peak {peak:.3f} exceeded full scale; normalized to 0.99 before write.")

        torchaudio.save(filepath, wav_tensor.cpu(), sample_rate)

        # The canonical copy always lives in storage/ so the library, playback
        # and history keep working; an explicit destination gets a copy too.
        saved_path = filepath
        if os.path.abspath(target_dir) != os.path.abspath(AUDIO_DIR):
            saved_path = os.path.join(target_dir, filename)
            shutil.copy2(filepath, saved_path)
            logger.info(f"Copied generation to {saved_path}")

        duration = wav_tensor.shape[-1] / sample_rate
        
        # Stream back the file
        def iterfile():
            with open(filepath, mode="rb") as file_like:
                yield from file_like

        headers = {
            "X-Audio-Path": f"/storage/audio/{filename}",
            "X-Saved-Path": saved_path,
            "X-Peak": f"{peak:.4f}",
            "X-Peak-Normalized": "true" if was_normalized else "false",
            "X-Duration": str(duration),
            "X-Sample-Rate": str(sample_rate),
            "X-Seed": str(used_seed) if used_seed else "",
            "X-Model-Id": model_id
        }
        
        return StreamingResponse(iterfile(), media_type="audio/wav", headers=headers)
        
    except ValueError as e:
        # An engine adapter raises ValueError for a request it can see is
        # wrong before it runs — an over-long reference clip, for instance.
        # That is the caller's problem to fix, not a server fault, and the
        # message is written for the user, so it travels as a 400.
        logger.warning(f"Rejected generation: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error during generation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

#: Longest pause the merge endpoint will insert between two clips.
MAX_MERGE_GAP_MS = 5000


def _resolve_generated_clip(stored: str) -> str:
    """Maps a clip path as the database stores it onto a file in AUDIO_DIR.

    Rows hold `/storage/audio/gen_x.wav`; only the basename is honoured, so a
    crafted path can never point the merge at a file outside storage/audio.
    """
    name = os.path.basename(stored.strip())
    if not name.endswith(".wav"):
        raise ValueError(f"Not a WAV clip: {stored}")
    path = os.path.join(AUDIO_DIR, name)
    if not os.path.isfile(path):
        raise ValueError(f"Clip not found: {name}")
    return path


@app.post("/api/merge")
async def merge_audio(
    paths: str = Form(...),
    gap_ms: int = Form(300),
    output_dir: Optional[str] = Form(None),
    filename_hint: Optional[str] = Form(None),
):
    """Joins generated clips, in the order given, into one WAV.

    This is how a project's segments become an episode. It never touches the
    model, so it does not take ModelManager's lock and can run while another
    generation is in flight. The export is 16-bit PCM rather than the float32
    the clips are stored as: an episode is meant to leave the app, and every
    editor and upload form reads 16-bit.
    """
    try:
        stored_paths = json.loads(paths)
        if not isinstance(stored_paths, list) or not all(isinstance(p, str) for p in stored_paths):
            raise ValueError
    except ValueError:
        raise HTTPException(status_code=400, detail="paths must be a JSON array of strings")

    try:
        clip_paths = [_resolve_generated_clip(p) for p in stored_paths]
        target_dir = resolve_output_dir(output_dir, AUDIO_DIR)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    gap_seconds = max(0, min(gap_ms, MAX_MERGE_GAP_MS)) / 1000

    def render():
        wav, rate = merge_clips(clip_paths, gap_seconds)
        wav, _, _ = normalize_peak(wav)
        filename = generate_unique_filename("merged", ".wav")
        filepath = os.path.join(AUDIO_DIR, filename)
        torchaudio.save(filepath, wav, rate, encoding="PCM_S", bits_per_sample=16)

        # The canonical copy stays in storage/audio for playback; a chosen
        # folder gets a copy named after the project, never overwriting one
        # the user already has there.
        saved_path = filepath
        if os.path.abspath(target_dir) != os.path.abspath(AUDIO_DIR):
            stem = safe_export_name(filename_hint)
            saved_path = os.path.join(target_dir, f"{stem}.wav")
            suffix = 2
            while os.path.exists(saved_path):
                saved_path = os.path.join(target_dir, f"{stem} ({suffix}).wav")
                suffix += 1
            shutil.copy2(filepath, saved_path)

        return {
            "audio_path": f"/storage/audio/{filename}",
            "saved_path": saved_path,
            "duration": wav.shape[-1] / rate,
            "sample_rate": rate,
            "file_size": os.path.getsize(filepath),
            "clips": len(clip_paths),
        }

    try:
        return await asyncio.get_running_loop().run_in_executor(None, render)
    except Exception as e:
        logger.error(f"Error during merge: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _reference_cap() -> float:
    """The shortest reference window among the registered models.

    References are stored once and used by whichever model is selected later,
    so the only clip guaranteed to work is one that fits every model on the
    board. With a single model registered this is simply that model's cap.
    """
    caps = [
        m["maxReferenceSeconds"]
        for m in model_registry.describe_all(model_manager.device)
        if m.get("maxReferenceSeconds")
    ]
    return min(caps) if caps else DEFAULT_MAX_REFERENCE_SECONDS


@app.post("/api/upload-reference")
async def upload_reference(file: UploadFile = File(...)):
    if not file.filename.endswith(".wav"):
        raise HTTPException(status_code=400, detail="Only WAV files are supported")
        
    filename = generate_unique_filename("ref", ".wav")
    filepath = os.path.join(VOICES_DIR, filename)
    
    await save_uploaded_file(file, filepath)
    
    # Validate against the reference window of the model this board actually
    # renders with. A 16 s clip passes a generic 30 s check and then produces
    # contaminated audio on OmniVoice, which is far worse than being refused
    # at upload time.
    validation = validate_audio_file(filepath, max_seconds=_reference_cap())
    if not validation["is_valid"]:
        os.remove(filepath)
        raise HTTPException(status_code=400, detail=f"Invalid audio: {', '.join(validation['errors'])}")
        
    return {
        "filename": filename,
        "path": filepath,
        "duration": validation["duration"],
        "sample_rate": validation["sample_rate"]
    }

@app.get("/api/voices")
async def list_voices():
    voices = []
    if not os.path.exists(VOICES_DIR):
        return voices
        
    for filename in os.listdir(VOICES_DIR):
        if filename.endswith(".wav"):
            filepath = os.path.join(VOICES_DIR, filename)
            stat = os.stat(filepath)
            try:
                duration = get_audio_duration(filepath)
                voices.append({
                    "filename": filename,
                    "path": filepath,
                    "duration": duration,
                    "size": stat.st_size,
                    "created_at": stat.st_ctime
                })
            except Exception as e:
                logger.warning(f"Could not read info for {filepath}: {e}")
                
    return voices

@app.delete("/api/voices/{filename}")
async def delete_voice(filename: str):
    filepath = os.path.join(VOICES_DIR, filename)
    if os.path.exists(filepath):
        os.remove(filepath)
        return {"status": "success", "message": f"Deleted {filename}"}
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/api/fs/browse")
async def browse_filesystem(path: Optional[str] = None, show_hidden: bool = False):
    """Lists sub-directories so the control board can pick a save location."""
    try:
        result = list_directories(path, show_hidden=show_hidden)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    result["shortcuts"] = build_shortcuts(AUDIO_DIR)
    result["default_dir"] = AUDIO_DIR
    return result

@app.get("/api/fs/validate")
async def validate_directory(path: str):
    """Checks a typed-in save folder without creating anything."""
    resolved = os.path.abspath(os.path.expanduser(path.strip())) if path.strip() else AUDIO_DIR
    exists = os.path.isdir(resolved)
    return {
        "path": resolved,
        "exists": exists,
        "writable": os.access(resolved, os.W_OK) if exists else os.access(os.path.dirname(resolved) or "/", os.W_OK),
        "is_default": os.path.abspath(resolved) == os.path.abspath(AUDIO_DIR),
    }

@app.get("/api/health")
async def health_check():
    status = model_manager.get_status()
    return {
        "status": "ok",
        "uptime": time.time() - START_TIME,
        **status
    }

@app.get("/api/progress")
async def get_progress():
    """What the engine is doing right now.

    Polled by the studio while a generation is pending — the 4B model runs
    several times slower than realtime, so a spinner alone cannot distinguish
    slow from stuck.
    """
    return progress.tracker.snapshot()

@app.get("/api/models")
async def list_models():
    """Every registered model with its capabilities and parameter schema.

    The control board renders its parameter controls from this, so a new model
    needs no frontend change.
    """
    return {
        "models": model_manager.list_models(),
        "default": model_registry.DEFAULT_MODEL_ID,
        "active": model_manager.active_id,
    }

@app.get("/api/model-info")
async def get_model_info():
    return model_manager.get_model_info()

if __name__ == "__main__":
    import uvicorn
    os.makedirs(os.path.dirname(ENGINE_SOCKET), mode=0o700, exist_ok=True)
    os.chmod(os.path.dirname(ENGINE_SOCKET), 0o700)
    uvicorn.run(app, uds=ENGINE_SOCKET)
