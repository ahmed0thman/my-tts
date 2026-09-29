"""Breath reduction for generated speech.

VoiceTut was fine-tuned on podcast speech and breathes like a podcaster: an
audible inhale at the start of most phrases. It has no control for that —
OmniVoice's `denoise` token cleans room noise, not breaths — so it is done on
the output: find the breaths, turn them down by `reduction_db`.

Same method as the editor's gate (public/audio-editor/sawtak-voice.js
`speechMap`), in numpy + torchaudio because the desktop runtime has no scipy:

* Speech is found by **voicing** — a pitch in 60–400 Hz by normalised
  autocorrelation on an 8 kHz copy — not by level. An inhale can be as loud as
  a soft syllable, but it has no pitch.
* A frame is a breath candidate when it sits in a long (≥ 120 ms) unvoiced
  stretch and carries little energy above 3 kHz (breaths measured 4.5–7 dB
  under the low band; /s/ /sh/ /f/ within ~3.5 dB).
* Candidates are then judged **as a whole stretch**, by its loudest frame:
  it must stay 26 dB under the voice, and 30 dB when it starts within 250 ms
  of a word. Measured on real takes, breaths peak 27–41 dB under the voice;
  what peaked 20–24 dB under, right after a word, was the word's own last
  sound — the ك of «موبايلك..», the end of «جواها.» — and cutting it made
  Whisper hear «موبايل» / «جواه» and made sentence ends sound swallowed.
  Judging frame by frame (20 dB, the first version) let the decaying tail of
  a word through a frame at a time. ح / ه, spoken 12–20 dB under the vowels,
  stay well clear.
* Never touched: voiced frames, gaps inside a phrase (voiced on both sides
  within 300 ms), the 150 ms after a word and the 50 ms before one. Cutting
  those is what clipped letters in the editor's first gate.

Reduction is a gain, not a mute: 20 dB leaves a breath you would only hear
with headphones, which keeps the "human" feel; 40 dB and up is removal.
"""

from typing import Optional, Tuple

import numpy as np
import torch
import torchaudio.functional as AF

HOP_SECONDS = 0.01
WINDOW_SECONDS = 0.03
VOICED_CORRELATION = 0.65
MIN_VOICED_FRAMES = 3
LONG_RUN_FRAMES = 12
#: A candidate stretch whose loudest frame comes within this of the voice is speech, not breath.
BREATH_UNDER_SPEECH_DB = 26.0
#: …and within this, when the stretch starts right after a word (a word's tail decays into it).
TAIL_UNDER_SPEECH_DB = 30.0
TAIL_FRAMES = 25
#: Protected after the last voiced frame of a word: its final consonant or release.
AFTER_WORD_FRAMES = 15
BEFORE_WORD_FRAMES = 5
BREATH_HIGH_BAND_DB = -3.5
#: At or above this, the result is true silence rather than a quiet breath.
REMOVE_AT_DB = 40.0


def _db(power: np.ndarray) -> np.ndarray:
    return 10.0 * np.log10(np.maximum(power, 1e-15))


def _biquad_twice(x: np.ndarray, sr: int, kind: str, freq: float) -> np.ndarray:
    t = torch.from_numpy(x.astype(np.float32))
    f = AF.highpass_biquad if kind == "highpass" else AF.lowpass_biquad
    t = f(f(t, sr, freq), sr, freq)
    return t.numpy()


def _voicing(x: np.ndarray, sr: int, centres: np.ndarray, active: np.ndarray) -> np.ndarray:
    """Best normalised autocorrelation in the 60–400 Hz lag range, per frame."""
    dec = max(1, sr // 8000)
    r8 = sr / dec
    lp = _biquad_twice(x, sr, "lowpass", min(3400.0, r8 * 0.42))
    d = lp[::dec].astype(np.float64)
    W = int(round(r8 * 0.04))
    lag_min, lag_max = int(r8 // 400), int(np.ceil(r8 / 60))

    starts = np.round(centres / dec).astype(int) - W // 2
    ok = active & (starts >= 0) & (starts + W + lag_max < len(d))
    best = np.zeros(len(centres))
    idx = np.where(ok)[0]
    if len(idx) == 0:
        return best
    offsets = np.arange(W)
    a = d[starts[idx, None] + offsets]
    e0 = (a * a).sum(axis=1)
    for lag in range(lag_min, lag_max + 1):
        b = d[starts[idx, None] + lag + offsets]
        r = (a * b).sum(axis=1) / np.sqrt(np.maximum(e0 * (b * b).sum(axis=1), 1e-20))
        best[idx] = np.maximum(best[idx], r)
    return best


def find_breaths(x: np.ndarray, sr: int) -> Optional[Tuple[np.ndarray, np.ndarray, float, int]]:
    """Per 10 ms frame: breath-like mask and level (dB), plus the voice's level and the hop.

    None when there is too little audio or no voiced speech to measure against.
    """
    n = len(x)
    hop = max(1, int(round(sr * HOP_SECONDS)))
    half = int(round(sr * WINDOW_SECONDS / 2))
    frames = n // hop
    if frames < 20:
        return None

    centres = np.arange(frames) * hop + hop // 2
    lo = np.clip(centres - half, 0, n)
    hi = np.clip(centres + half, 0, n)
    cum = np.concatenate([[0.0], np.cumsum(x.astype(np.float64) ** 2)])
    hf = _biquad_twice(x, sr, "highpass", 3000.0)
    cum_h = np.concatenate([[0.0], np.cumsum(hf.astype(np.float64) ** 2)])
    energy = cum[hi] - cum[lo]
    lev = _db(energy / np.maximum(hi - lo, 1))
    hfr = _db((cum_h[hi] - cum_h[lo]) / np.maximum(energy, 1e-15))

    floor = np.percentile(lev, 10)
    pitched = _voicing(x, sr, centres, lev >= floor + 10) > VOICED_CORRELATION

    # A voiced stretch shorter than 30 ms is a flicker inside a breath.
    voiced = np.zeros(frames, dtype=bool)
    f = 0
    while f < frames:
        if not pitched[f]:
            f += 1
            continue
        g = f
        while g < frames and pitched[g]:
            g += 1
        if g - f >= MIN_VOICED_FRAMES:
            voiced[f:g] = True
        f = g
    if voiced.sum() < 10:
        return None
    speech_db = np.percentile(lev[voiced], 90)

    # Distance to the nearest voiced frame before / after, and long unvoiced runs.
    since = np.empty(frames, dtype=int)
    until = np.empty(frames, dtype=int)
    last = -10**6
    for f in range(frames):
        if voiced[f]:
            last = f
        since[f] = f - last
    nxt = 10**6
    for f in range(frames - 1, -1, -1):
        if voiced[f]:
            nxt = f
        until[f] = nxt - f
    long_run = np.zeros(frames, dtype=bool)
    f = 0
    while f < frames:
        if voiced[f]:
            f += 1
            continue
        g = f
        while g < frames and not voiced[g]:
            g += 1
        if g - f >= LONG_RUN_FRAMES:
            long_run[f:g] = True
        f = g

    hf_smooth = np.convolve(hfr, np.ones(3) / 3, mode="same")
    protected = voiced | (since + until <= 30) | (since <= AFTER_WORD_FRAMES) | (until <= BEFORE_WORD_FRAMES)
    candidate = long_run & ~protected & (hf_smooth < BREATH_HIGH_BAND_DB)

    # Judge each candidate stretch by its loudest frame, so a word's decaying
    # tail cannot be taken a frame at a time.
    breathy = np.zeros(frames, dtype=bool)
    f = 0
    while f < frames:
        if not candidate[f]:
            f += 1
            continue
        g = f
        while g < frames and candidate[g]:
            g += 1
        limit = TAIL_UNDER_SPEECH_DB if since[f] <= TAIL_FRAMES else BREATH_UNDER_SPEECH_DB
        if lev[f:g].max() < speech_db - limit:
            breathy[f:g] = True
        f = g
    return breathy, lev, float(speech_db), hop


def reduce_breaths(wav: torch.Tensor, sr: int, reduction_db: float) -> Tuple[torch.Tensor, float]:
    """Turn breaths down by `reduction_db`. Returns (audio, seconds of breath found)."""
    if reduction_db <= 0:
        return wav, 0.0
    x = wav.detach().cpu().float().numpy().reshape(-1)
    found = find_breaths(x, sr)
    if found is None:
        return wav, 0.0
    breathy, _, _, hop = found
    if not breathy.any():
        return wav, 0.0
    n, frames = len(x), len(breathy)

    # Frame targets → samples, then zero-phase smoothing (10 ms) so the gain
    # has moved back up before a word starts rather than after.
    target_db = np.where(breathy, -float(reduction_db), 0.0)
    pos = np.arange(n) / hop - 0.5
    gain_db = np.interp(pos, np.arange(frames), target_db)
    k = float(np.exp(-1.0 / (0.010 * sr)))
    g = torch.from_numpy(gain_db.astype(np.float32))
    a = torch.tensor([1.0, -k])
    b = torch.tensor([1.0 - k, 0.0])
    g = AF.lfilter(g, a, b, clamp=False)
    g = AF.lfilter(g.flip(0), a, b, clamp=False).flip(0).numpy()
    gain = np.power(10.0, g / 20.0)
    if reduction_db >= REMOVE_AT_DB:
        gain[gain < 10 ** (-(REMOVE_AT_DB - 2) / 20)] = 0.0

    out = torch.from_numpy((x * gain).astype(np.float32)).reshape(wav.shape)
    return out, float(breathy.sum() * hop / sr)


def breath_free_reference(path: str, sr_hint: int = 24000) -> str:
    """A copy of a reference clip with its breaths silenced, cached by content.

    VoiceTut imitates the reference's delivery, breathing included. Measured
    here with one voice (Mohamed, 18% breath), three takes each of the same
    text: the original reference gave 0.38–0.68 s of audible breath per
    11.5 s take, the breath-free copy 0.07–0.17 s — about a quarter.

    Only gain changes, never timing, so the clip still lines up with its
    transcript (which is what VoiceTut conditions on). The copy lives in the
    system temp folder, keyed by the source's path, size and mtime, so it is
    made once per reference and never written inside the app bundle.
    """
    import hashlib
    import os
    import tempfile

    import torchaudio

    st = os.stat(path)
    key = hashlib.sha1(f"{os.path.abspath(path)}|{st.st_size}|{st.st_mtime_ns}".encode()).hexdigest()[:16]
    folder = os.path.join(tempfile.gettempdir(), "sawtak-breath-free")
    out = os.path.join(folder, f"{key}.wav")
    if os.path.exists(out):
        return out

    wav, sr = torchaudio.load(path)
    mono = wav.mean(0)
    cleaned, seconds = reduce_breaths(mono, sr, 60.0)
    if seconds <= 0:
        return path
    os.makedirs(folder, exist_ok=True)
    # The extension is what torchaudio reads the format from, so the partial
    # file must end in .wav too.
    tmp = os.path.join(folder, f"{key}.{os.getpid()}.tmp.wav")
    torchaudio.save(tmp, cleaned.unsqueeze(0), sr)
    os.replace(tmp, out)
    return out
