/**
 * The paragraph the user reads aloud when recording a voice reference.
 *
 * SILMA is trained on Modern Standard Arabic (Fusha) and English, so the
 * reference is written in Fusha: a clip that matches the model's own domain
 * clones far more faithfully than colloquial speech does.
 *
 * SILMA also needs the *transcription* of the reference clip, not just the
 * audio. Because the user reads this exact text, we can hand the engine a
 * perfect transcription with no typing and no speech-recognition step —
 * which is why this file exports the joined text as well as the lines.
 *
 * Chosen for coverage in ~20 seconds:
 *  - the emphatics ص ض ط ظ, the pharyngeals ع ح, and خ غ ق ء
 *  - short and long vowels, plus the ـَي / ـَو diphthongs
 *  - gemination (تتميّز، الشّمس) so held consonants are heard
 *  - one intonation contour per line: statement, question, list, and a
 *    falling close — the prosody range the model has to imitate
 *  - full ta'sheel: no tongue-twisters, nothing awkward to read aloud
 */
export const REFERENCE_SCRIPT_LINES = [
  'أهلاً بك، أُسجّل هذه الفقرة كي يتعرّف النموذج على صوتي وطريقة نطقي بدقّة.',
  'في الصباح الباكر أشربُ فنجان قهوة، وأقرأ بعض الأخبار قبل أن أبدأ عملي.',
  'هل تُفضّل أن يكون الحديث هادئاً ورصيناً، أم مليئاً بالحماس والضحك؟',
  'أحضرتُ من السوق ثلاثة أشياء: خبزاً طازجاً، وجبناً أبيض، وخضاراً خضراء.',
  'حسناً، أظنّ أنّ الصوت خرج طبيعياً وواضحاً ومضبوطاً.',
];

export const REFERENCE_SCRIPT = REFERENCE_SCRIPT_LINES.join(' ');

/** Roughly how long the script takes at a natural reading pace. */
export const REFERENCE_SCRIPT_ESTIMATE = '≈ 20 ثانية';

export const RECORDING_TIPS = [
  'اقرأ بصوتك الطبيعي وسرعتك المعتادة — لا بصوت المذيعين.',
  'اجلس في غرفة هادئة، وابتعد عن المروحة والتكييف.',
  'اجعل الميكروفون على بُعد شبر من فمك، لا ملاصقاً له.',
  'خذ نفساً قبل أن تبدأ، ولا تقف طويلاً بين الجمل.',
  'إن أخطأت في كلمة، أعِد التسجيل من البداية — أنظف من أن تُكمل.',
  'اقرأ النصّ كما هو بالضبط؛ المحرّك يستخدمه كنصّ مرجعي للعينة.',
];
