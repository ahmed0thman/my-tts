/**
 * The paragraph the user reads aloud when recording a voice reference.
 *
 * Two constraints decide everything about this text.
 *
 * **It has to fit the model's reference window.** VoiceTut conditions on
 * (reference audio + reference transcript) and continues that sequence, so a
 * clip past its ~10s window does not merely soften the likeness — the model
 * starts reciting the reference and drops the head of the requested text.
 * Measured here: a 16.2s reference lost the prompt's first sentence in both of
 * two takes; the same voice cut to 8.9s reproduced the prompt verbatim. So the
 * script is written to land near 7 seconds, comfortably inside the window even
 * if the user reads slowly.
 *
 * **It has to be in the model's own dialect.** VoiceTut is fine-tuned on
 * Egyptian podcast speech; a reference read in Fusha asks it to clone a
 * register it did not learn. (This script used to be Fusha, for SILMA, and
 * ~20s long, for the NAMAA models which had no reference cap. Both of those
 * models are unregistered on this branch, and that script is what produced
 * every over-long reference in the database.)
 *
 * Because the user reads this exact text, the engine gets a perfect
 * transcription with no typing and no speech-recognition step — which is why
 * this file exports the joined text as well as the lines.
 *
 * Coverage in ~7 seconds:
 *  - the emphatics ص ض ط ظ (صوتي، بعض، طب، بالظبط) and غ ع ح خ ق
 *  - gemination (بسجّل) so held consonants are heard
 *  - one statement and one question, which is the minimum prosody range the
 *    model has to imitate
 */
export const REFERENCE_SCRIPT_LINES = [
  'أهلاً بيك، أنا بسجّل الفقرة دي عشان النموذج يعرف صوتي بالظبط.',
  'طب إيه رأيك نشتغل مع بعض؟ خُد نفسك واقرا براحتك.',
];

export const REFERENCE_SCRIPT = REFERENCE_SCRIPT_LINES.join(' ');

/** Roughly how long the script takes at a natural reading pace. */
export const REFERENCE_SCRIPT_ESTIMATE = '≈ ٧ ثواني';

export const RECORDING_TIPS = [
  'اقرأ بصوتك الطبيعي وسرعتك المعتادة — مش بصوت المذيعين.',
  'اقعد في أوضة هادية، وابعد عن المروحة والتكييف.',
  'خلّي الميكروفون على بُعد شبر من بقّك، مش ملزوق فيه.',
  'خُد نفسك قبل ما تبدأ، وما تقفش كتير بين الجمل.',
  'لو غلطت في كلمة، أعِد التسجيل من الأول — أنضف من إنك تكمّل.',
  'اقرا النص زي ما هو بالظبط؛ المحرّك بيستخدمه كنص مرجعي للعينة.',
];
