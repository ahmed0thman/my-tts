# AudioMass, vendored

The in-app audio editor is [AudioMass](https://github.com/pkalogiros/AudioMass)
(MIT; bundled libraries keep their own licenses — see `THIRD_PARTY_NOTICES.md`,
including the LGPL `lame.js`, shipped unmodified as a separate file).

- Source: `production` branch at `21f5ee1362a47be6f0dbe6e4969a15e43d21b044`.
- Removed: demo audio (`test.mp3`, `piano-sample.mp3`, `mp3/multi/`), marketing
  pages (`about*`, `mix.html`, `sp.html`, `index-*.html`), the service worker,
  manifest, appcache and server scripts.
- Changed:
  - `index.html` — trimmed head, adds `sawtak-theme.css` and `sawtak-bridge.js`,
    skips the welcome modal.
  - `actions.js` — one guarded block in `forceDownload` that hands a
    host-requested export to `window.SawtakBridge` instead of downloading.
  - `engine.js` — the overview canvas reads `--bg-0` / `--ac` instead of
    hard-coded black and cyan.
  - `dist/wavesurfer.js` — a `sawtakVar()` helper at the top, and the waveform
    background and ruler colors read `--bg-0`, `--bg-1`, `--fg-1`, `--ac`
    instead of hard-coded black/grey (otherwise light mode keeps a black
    waveform). Also a `sawtakAmp()` helper used by `drawLineToContext`'s two
    amplitude→pixel lines, which draws on a dB scale (−60 dB at the centre
    line) when `window.SawtakWave.log` is set.
- Added: `sawtak-voice.js` — the «تحسين احترافي» voice polish chain (high-pass →
  breath & silence gate on the audio as loaded (peak dBFS, user threshold,
  -40 by default) → RNNoise → tone EQ → de-esser → 2.5:1 compression →
  -19 LUFS → -1.5 dBFS look-ahead limiter).
  Also the selection edits: `gainEdit` (5 ms eased edges) and `stretch`
  (pitch-preserving WSOLA, used instead of AudioMass's overlap-add tempo). Pure JS over Float32Arrays, testable in Node. It
  calls AudioMass's RNNoise wasm directly (`wasm_rnnDenoise_rawmem` +
  `wasm_freeBuffer`) and compensates its one-frame (rate/100 samples) latency.
- Added: `sawtak-db-axis.js` — dBFS numbers in the gutter left of the waveform,
  dashed grid lines at the same levels, and a dB/LIN toggle (dB by default,
  remembered in localStorage). Its layout repeats wavesurfer's lane geometry
  (20 px timeline strip, `params.height / 2` per channel, halved for stereo);
  keep them in step if `prepareDraw` / `drawWave` change.
- Added: `sawtak-bridge.js` (postMessage protocol with the host page; it
  also replaces `window.alert` so AudioMass's alerts become the app's toasts) and
  `sawtak-theme.css` (overrides that the CSS-variable mapping in the bridge
  cannot reach).

To update: re-copy `src/` from a newer commit, re-apply the two changes above,
and re-check that `engine.LoadArrayBuffer` and `engine.DownloadFile` keep their
signatures — the bridge calls both.
