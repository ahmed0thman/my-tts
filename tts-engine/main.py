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
from fastapi.middleware.cors import CORSMiddleware
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
    list_directories,
    build_shortcuts,
)

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="NAMAA Egyptian TTS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model_manager = ModelManager()

# Directories
STORAGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "storage"))
AUDIO_DIR = os.path.join(STORAGE_DIR, "audio")
VOICES_DIR = os.path.join(STORAGE_DIR, "voice-samples")

START_TIME = time.time()

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
    uvicorn.run(app, host="0.0.0.0", port=8000)
