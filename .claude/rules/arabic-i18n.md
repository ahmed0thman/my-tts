# Arabic Typography & RTL Rules

## Typography
- Primary typeface is **Cairo**, loaded from Google Fonts in `src/app/globals.css`:
  ```css
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700&display=swap');
  ```
- Fallback font stack: `'Cairo', system-ui, -apple-system, sans-serif`.

## Directionality (RTL vs LTR)
- The root document is set to `dir="rtl"` in `src/app/layout.tsx`.
- The `AppShell` container maintains `dir="rtl"` layout flow.
- Specific elements that must stay **LTR**:
  - Code snippets, URLs, and server endpoints (`dir="ltr" font-mono`).
  - Audio waveform progress scrubbers and time displays (`00:00 / 00:05`).
  - Hardware specification badges (e.g., `MPS`, `24000 Hz`).
  - Switch toggle controls (to maintain expected horizontal thumb slide physics).

## Translation & Vocabulary Standards
- Keep dialect terminology authentic to Egyptian Arabic users:
  - "Generate Speech": `إنشاء الصوت`
  - "Voice Profile": `صوت مخصص` / `ملف الصوت`
  - "Speed": `سرعة الإلقاء`
  - "CFG Strength": `الالتزام بالعينة`
  - "NFE Steps": `خطوات التوليد`
  - "Reference text": `نص العينة`
  - "Batch Mode": `وضع الدفعات`
  - "Presets": `الإعدادات المسبقة`
  - "History": `سجل التوليد`
