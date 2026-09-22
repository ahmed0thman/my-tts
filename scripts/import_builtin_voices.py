#!/usr/bin/env python
"""Import VoiceTut's 17 bundled reference speakers as ordinary voice profiles.

The model ships curated reference clips with their exact transcripts. Those are
the two things the cloning path needs, so rather than teaching the board about a
second kind of voice, they are imported as normal `VoiceProfile` rows: the
dropdown, history, presets and the default flag then work on them with no
special-casing anywhere.

The WAVs are *copied* into `storage/voice-samples/` (converted to 24 kHz mono
PCM16 like every other reference) instead of being referenced inside the
HuggingFace cache. Otherwise clearing the cache would break the profiles, and
deleting one from the UI would reach into the cache and delete a model file.

Idempotent: re-running skips speakers already imported.

    tts-engine/venv/bin/python scripts/import_builtin_voices.py [--force]
"""

import argparse
import os
import random
import sqlite3
import string
import sys
import time
import warnings

warnings.filterwarnings("ignore")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tts-engine"))
sys.path.insert(0, os.path.join(ROOT, "tts-engine", "engines", "vendor"))

DB = os.path.join(ROOT, "prisma", "namaa.db")
SAMPLES = os.path.join(ROOT, "storage", "voice-samples")
SAMPLE_RATE = 24000

#: Marks an imported profile so it is recognisable in the list and so re-runs
#: can tell its rows apart from voices the user recorded.
SUFFIX = "(صوت جاهز)"

GENDER_AR = {"male": "رجّالي", "female": "حريمي"}


def _cuid() -> str:
    """A Prisma-shaped id. Collisions are not a concern at 17 rows."""
    return "cmv" + "".join(random.choices(string.ascii_lowercase + string.digits, k=22))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="re-import even if already present")
    args = parser.parse_args()

    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

    import torchaudio
    from huggingface_hub import snapshot_download
    from voicetut_tts.speakers import SpeakerRegistry

    from engines.voicetut_engine import REPO_ID

    model_dir = snapshot_download(
        repo_id=REPO_ID,
        repo_type="model",
        allow_patterns=["reference_speakers/*"],
        token=os.getenv("HF_TOKEN"),
    )
    registry = SpeakerRegistry(os.path.join(model_dir, "reference_speakers", "references.json"))
    speakers = registry.all() if hasattr(registry, "all") else list(registry)

    os.makedirs(SAMPLES, exist_ok=True)
    db = sqlite3.connect(DB)
    existing = {row[0] for row in db.execute("SELECT name FROM VoiceProfile")}

    imported = skipped = 0
    for spk in speakers:
        name = f"{spk.speaker_name} {SUFFIX}"
        if name in existing and not args.force:
            skipped += 1
            continue

        wav, sr = torchaudio.load(spk.audio_path)
        if wav.shape[0] > 1:
            wav = wav.mean(dim=0, keepdim=True)
        if sr != SAMPLE_RATE:
            wav = torchaudio.functional.resample(wav, sr, SAMPLE_RATE)
        duration = wav.shape[-1] / SAMPLE_RATE

        dest = os.path.join(SAMPLES, f"ref_builtin_{spk.speaker_name.lower()}.wav")
        torchaudio.save(dest, wav, SAMPLE_RATE, encoding="PCM_S", bits_per_sample=16)

        bits = [f"صوت جاهز من VoiceTut", GENDER_AR.get(spk.gender, spk.gender)]
        if spk.tags:
            bits.append("، ".join(spk.tags))
        now = int(time.time() * 1000)

        db.execute("DELETE FROM VoiceProfile WHERE name = ?", (name,))
        db.execute(
            "INSERT INTO VoiceProfile"
            " (id,name,description,referenceAudioPath,referenceText,duration,isDefault,isBuiltin,createdAt,updatedAt)"
            " VALUES (?,?,?,?,?,?,0,1,?,?)",
            (_cuid(), name, " — ".join(bits), os.path.abspath(dest),
             spk.reference_text, duration, now, now),
        )
        flag = "  (over the 10s guidance)" if duration > 10 else ""
        print(f"  + {spk.speaker_name:14} {spk.gender:7} {duration:5.2f}s{flag}")
        imported += 1

    db.commit()
    total = db.execute("SELECT COUNT(*) FROM VoiceProfile").fetchone()[0]
    print(f"\nimported {imported}, skipped {skipped} already present — {total} profiles total")
    if skipped and not args.force:
        print("re-run with --force to refresh them")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
