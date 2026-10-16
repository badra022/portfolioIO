import type { Content } from "./schema";

/**
 * The site's language: one per teacher (content.locale, set in the admin under
 * «اللغة والنصوص العامة»). Arabic sites read right-to-left, English sites
 * left-to-right. The teacher writes their own texts in that language; this file
 * holds the site's built-in texts (buttons, errors, timers...) in both.
 * The admin panel itself stays in Arabic.
 */
export const LOCALES = ["ar-EG", "en"] as const;
export type Lang = "ar" | "en";

export const langOf = (locale: string | undefined): Lang => (locale?.toLowerCase().startsWith("en") ? "en" : "ar");
export const dirOf = (locale: string | undefined): "rtl" | "ltr" => (langOf(locale) === "en" ? "ltr" : "rtl");

const ar = {
  /** For dates and times (Latin digits). */
  intl: "ar-EG",
  close: "إغلاق",
  prev: "السابق",
  next: "التالي",
  optional: "(اختياري)",
  choose: "اختر…",
  required: "مطلوب",
  badPhone: "اكتب رقم صحيح",
  badNumber: "اكتب رقم",
  badChoice: "اختر من القائمة",
  sending: "جاري الإرسال…",
  error: "حصلت مشكلة، حاول تاني.",
  offline: "مفيش اتصال بالإنترنت؟ حاول تاني.",
  cantSend: "لا يمكن الإرسال الآن.",
  ok: "تمام",
  edit: "تعديل",
  notYou: "مش انت؟ عدّل",
  readMore: "اقرأ المزيد",
  readLess: "عرض أقل",
  menu: "قائمة الأقسام",
  menuClose: "إغلاق القائمة",
  pageSections: "أقسام الصفحة",
  notFound: "الصفحة غير موجودة.",
  and: "و",
  // countdowns
  endsIn: "ينتهي خلال",
  day: "يوم",
  hour: "ساعة",
  minute: "دقيقة",
  second: "ثانية",
  // challenge
  pickAnswer: "اختار إجابة الأول",
  // schedule
  available: "فيه أماكن",
  full: "كامل العدد",
  notStarted: "لسه مبدأتش",
  startsOn: "تبدأ",
  soon: "قريب",
  waitlist: "سجّلني في قائمة الانتظار",
  reserve: "احجز مكانك من دلوقتي",
  waitlistMsg: "السلام عليكم، مجموعة {grade} ({subject}) {days} {time} كاملة. ممكن تسجلني في قائمة الانتظار لو فضي مكان؟",
  reserveMsg: "السلام عليكم، عايز أحجز مكان في مجموعة {grade} ({subject}) اللي هتبدأ {start}. ممكن التفاصيل؟",
  // votes
  pollDescription: "صوّت من غير اسم ولا رقم.",
  pollTag: "تصويت · من غير اسم ولا رقم",
  pollTimer: "باقي على نهاية التصويت",
  pollClosedNow: "التصويت مقفول دلوقتي.",
  pollNotYet: "التصويت لسه مبدأش. ارجع تاني قريب.",
  pollOver: "التصويت انتهى. شكراً لكل اللي شاركوا!",
  pollVotes: "{n} صوت لحد دلوقتي",
  copied: "اتنسخ الرابط",
  sharePoll: "شارك التصويت",
  // quizzes
  loading: "جاري التحميل…",
  quizOffline: "مفيش اتصال بالإنترنت. أعد تحميل الصفحة لما يرجع.",
  quizTimeUp: "انتهى الوقت، جاري تسليم إجاباتك…",
  quizSubmitting: "جاري التسليم…",
  quizRetrying: "مفيش اتصال… هنحاول نسلّم تاني تلقائياً، متقفلش الصفحة.",
  quizNotYet: "الاختبار لسه مبدأش.",
  quizClosed: "الاختبار اتقفل.",
  quizQuestions: "{n} سؤال",
  quizMinutes: "{n} دقيقة",
  quizNoTimer: "بدون وقت محدد",
  quizUntil: "متاح حتى {when}",
  quizTimerNote: "الوقت بيبدأ أول ما تضغط، ومش هتقدر تدخل الاختبار تاني بعد التسليم.",
  wait: "لحظة…",
  quizStartsAt: "الاختبار هيبدأ {when}. الصفحة هتفتح لوحدها.",
  quizOver: "الاختبار انتهى.",
  quizEmpty: "الاختبار لسه بيتجهز.",
  quizClosedNow: "الاختبار مقفول دلوقتي.",
  question: "سؤال {n}",
  yourAnswer: "اكتب إجابتك",
  unanswered: "فاضل {n} سؤال من غير إجابة. ",
  confirmSubmit: "متأكد؟ مش هتقدر تعدّل بعد التسليم.",
  confirm: "تأكيد التسليم",
  back: "رجوع",
  quizTimedOut: "انتهى الوقت وتم تسليم إجاباتك تلقائياً.",
  quizAlready: "انت سلّمت الاختبار ده قبل كده.",
  backToSite: "الرجوع للموقع",
  yourGrade: "درجتك",
  gradePassed: "ناجح، برافو!",
  gradeFailed: "محتاج تذاكر أكتر",
  ungradedNote: "{n} سؤال بيتصحح من المستر ومش محسوب هنا.",
  reviewAnswers: "مراجعة إجاباتك",
  yourAnswerWas: "إجابتك",
  rightAnswer: "الإجابة الصحيحة",
  noAnswer: "من غير إجابة",
  notGraded: "بيتصحح من المستر",
  // exam results
  studentName: "اسم الطالب",
  studentNameHint: "زي ما هو مكتوب عند المستر",
  phone: "رقم الموبايل",
  pickExam: "اختار الامتحان اللي عايز تعرف نتيجتك فيه.",
  searching: "جاري البحث عن نتيجتك…",
  yourResult: "نتيجتك في {exam}",
  enterDetails: "اكتب اسمك ورقم الموبايل اللي مسجّل بيه عند المستر.",
  searchingShort: "جاري البحث…",
  findResult: "اعرف نتيجتك",
  otherExam: "امتحان تاني",
  noResult: "مش لاقيين نتيجة بالاسم والرقم دول.",
  noResultHint: "اتأكد إنك كاتب اسمك الأول صح، ونفس رقم الموبايل اللي سجلت بيه عند المستر.",
  editDetails: "عدّل البيانات",
  enterName: "اكتب اسمك",
  tooMany: "محاولات كتير. استنى شوية وجرّب تاني.",
  resultMissing: "النتيجة دي مش متاحة دلوقتي.",
  // the anonymous complaints box (components/Complaints.tsx)
  complaintsEyebrow: "صندوق الشكاوى",
  complaintsTitle: "عندك شكوى أو اقتراح؟",
  complaintsIntro: "اكتب اللي مضايقك أو اللي نفسك يتحسن. هيوصل للمدرس من غير اسمك.",
  complaintsTopic: "عن إيه؟",
  complaintsPlaceholder: "اكتب هنا براحتك…",
  complaintsSend: "ابعت من غير اسم",
  complaintsThanks: "وصلت، شكراً إنك قلت. رأيك هيتقرا.",
  complaintsAnon: "مش بنسجل اسمك ولا رقمك ولا جهازك.",
  complaintsShort: "اكتب جملة على الأقل",
  complaintsAnother: "ابعت رسالة تانية",
  // the sections menu
  sections: {
    hero: "الرئيسية", featured: "عروض وإعلانات", grades: "الصفوف والمواد", schedule: "المواعيد", method: "طريقة الشرح",
    book: "الكتاب", students: "الطلاب", reviews: "آراء الطلاب", challenge: "التحدي", exams: "الامتحانات",
    youtube: "الفيديوهات", services: "خدمات أخرى", honors: "لوحة الشرف", faq: "أسئلة شائعة", complaints: "الشكاوى والاقتراحات", final: "تواصل معانا",
  } as Record<Content["sections"][number], string>,
};

export type UIText = typeof ar;

const en: UIText = {
  intl: "en-GB",
  close: "Close",
  prev: "Previous",
  next: "Next",
  optional: "(optional)",
  choose: "Choose…",
  required: "Required",
  badPhone: "Enter a valid number",
  badNumber: "Enter a number",
  badChoice: "Choose from the list",
  sending: "Sending…",
  error: "Something went wrong, please try again.",
  offline: "No internet connection? Please try again.",
  cantSend: "Can't send right now.",
  ok: "OK",
  edit: "Edit",
  notYou: "Not you? Edit",
  readMore: "Read more",
  readLess: "Show less",
  menu: "Page sections",
  menuClose: "Close menu",
  pageSections: "Page sections",
  notFound: "Page not found.",
  and: "and",
  endsIn: "Ends in",
  day: "d",
  hour: "h",
  minute: "min",
  second: "s",
  pickAnswer: "Pick an answer first",
  available: "Places available",
  full: "Full",
  notStarted: "Not started yet",
  startsOn: "Starts",
  soon: "soon",
  waitlist: "Join the waiting list",
  reserve: "Book your place now",
  waitlistMsg: "Hello, the {grade} ({subject}) group {days} {time} is full. Could you add me to the waiting list in case a place opens up?",
  reserveMsg: "Hello, I'd like to book a place in the {grade} ({subject}) group starting {start}. Could you send me the details?",
  pollDescription: "Vote anonymously: no name, no number.",
  pollTag: "Vote · anonymous",
  pollTimer: "Time left to vote",
  pollClosedNow: "Voting is closed right now.",
  pollNotYet: "Voting hasn't started yet. Come back soon.",
  pollOver: "Voting has ended. Thanks to everyone who took part!",
  pollVotes: "{n} votes so far",
  copied: "Link copied",
  sharePoll: "Share the vote",
  loading: "Loading…",
  quizOffline: "No internet connection. Reload the page when it's back.",
  quizTimeUp: "Time's up, submitting your answers…",
  quizSubmitting: "Submitting…",
  quizRetrying: "No connection… we'll keep trying to submit, don't close the page.",
  quizNotYet: "The quiz hasn't started yet.",
  quizClosed: "The quiz is closed.",
  quizQuestions: "{n} questions",
  quizMinutes: "{n} minutes",
  quizNoTimer: "No time limit",
  quizUntil: "Open until {when}",
  quizTimerNote: "The timer starts as soon as you press start, and you can't come back to the quiz after submitting.",
  wait: "One moment…",
  quizStartsAt: "The quiz starts {when}. This page will open by itself.",
  quizOver: "The quiz has ended.",
  quizEmpty: "The quiz is still being prepared.",
  quizClosedNow: "The quiz is closed right now.",
  question: "Question {n}",
  yourAnswer: "Write your answer",
  unanswered: "{n} questions are still unanswered. ",
  confirmSubmit: "Are you sure? You can't change your answers after submitting.",
  confirm: "Submit",
  back: "Back",
  quizTimedOut: "Time ran out and your answers were submitted automatically.",
  quizAlready: "You've already submitted this quiz.",
  backToSite: "Back to the site",
  yourGrade: "Your grade",
  gradePassed: "Passed, well done!",
  gradeFailed: "Keep studying",
  ungradedNote: "{n} questions are graded by the teacher and not counted here.",
  reviewAnswers: "Review your answers",
  yourAnswerWas: "Your answer",
  rightAnswer: "Right answer",
  noAnswer: "No answer",
  notGraded: "Graded by the teacher",
  studentName: "Student name",
  studentNameHint: "As registered with your teacher",
  phone: "Mobile number",
  pickExam: "Choose the exam you want your result for.",
  searching: "Looking for your result…",
  yourResult: "Your result in {exam}",
  enterDetails: "Enter your name and the mobile number you registered with.",
  searchingShort: "Searching…",
  findResult: "Get your result",
  otherExam: "Another exam",
  noResult: "We couldn't find a result for this name and number.",
  noResultHint: "Check that your first name is spelled right and that it's the same mobile number you registered with.",
  editDetails: "Edit details",
  enterName: "Enter your name",
  tooMany: "Too many attempts. Please wait a bit and try again.",
  resultMissing: "This result isn't available right now.",
  complaintsEyebrow: "Feedback box",
  complaintsTitle: "Have a complaint or a suggestion?",
  complaintsIntro: "Tell us what bothers you or what could be better. It reaches the teacher without your name.",
  complaintsTopic: "What is it about?",
  complaintsPlaceholder: "Write freely…",
  complaintsSend: "Send anonymously",
  complaintsThanks: "Received, thank you for telling us. It will be read.",
  complaintsAnon: "We don't record your name, number or device.",
  complaintsShort: "Write at least one sentence",
  complaintsAnother: "Send another message",
  sections: {
    hero: "Home", featured: "Offers", grades: "Grades & subjects", schedule: "Schedule", method: "How I teach",
    book: "The book", students: "Students", reviews: "Reviews", challenge: "Challenge", exams: "Exams",
    youtube: "Videos", services: "More services", honors: "Honor board", faq: "FAQ", complaints: "Feedback", final: "Contact",
  },
};

const UI: Record<Lang, UIText> = { ar, en };

/** The built-in texts for a site's locale. */
export const ui = (locale: string | undefined): UIText => UI[langOf(locale)];

/** "{n} questions" → "5 questions". */
export const tf = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/* ------------------------------------------------------------------ */
/* Ready-made texts in the content                                     */
/* ------------------------------------------------------------------ */

/** Defaults from schema.ts (and the starter template's day names) with their English. */
const AR_TO_EN: Record<string, string> = {
  "إرسال": "Send",
  "وصلتنا بياناتك، وهنكلمك قريب.": "We got your details and will contact you soon.",
  "نتايج الامتحانات اللي فاتت": "Past exam results",
  "عرض كل الآراء": "Show all reviews",
  "محتوى الصفحة": "On this page",
  "ابدأ الاختبار": "Start the quiz",
  "سلّم الإجابات": "Submit answers",
  "تم تسليم إجاباتك. بالتوفيق!": "Your answers were submitted. Good luck!",
  "ابعت صوتك": "Vote",
  "شكراً! صوتك اتسجل.": "Thanks! Your vote was counted.",
  "السبت": "Sat", "الأحد": "Sun", "الاحد": "Sun", "الاثنين": "Mon", "الاتنين": "Mon", "الثلاثاء": "Tue", "التلات": "Tue",
  "الأربعاء": "Wed", "الاربعاء": "Wed", "الخميس": "Thu", "الجمعة": "Fri",
  "ص": "AM", "م": "PM", " و": " & ", " و ": " & ",
};

/**
 * On an English site, ready-made Arabic texts the teacher never changed (button
 * labels from the schema defaults, day names, AM/PM) show in English. Texts the
 * teacher wrote are left as they are.
 */
export function localizeDefaults(c: Content): Content {
  if (langOf(c.locale) === "ar") return c;
  const tr = (v: string) => AR_TO_EN[v] ?? v;
  return {
    ...c,
    forms: c.forms.map((f) => ({ ...f, submitLabel: tr(f.submitLabel), successMessage: tr(f.successMessage) })),
    quizzes: c.quizzes.map((q) => ({ ...q, startLabel: tr(q.startLabel), submitLabel: tr(q.submitLabel), doneMessage: tr(q.doneMessage) })),
    polls: c.polls.map((p) => ({ ...p, submitLabel: tr(p.submitLabel), doneMessage: tr(p.doneMessage) })),
    menu: { ...c.menu, title: tr(c.menu.title) },
    exams: c.exams && { ...c.exams, resultsLabel: tr(c.exams.resultsLabel) },
    reviews: c.reviews && { ...c.reviews, moreLabel: tr(c.reviews.moreLabel) },
    schedule: c.schedule && { ...c.schedule, labels: { ...c.schedule.labels, am: tr(c.schedule.labels.am), pm: tr(c.schedule.labels.pm) } },
    labels: {
      ...c.labels,
      days: Object.fromEntries(Object.entries(c.labels.days).map(([k, v]) => [k, tr(v)])) as Content["labels"]["days"],
      daysJoiner: tr(c.labels.daysJoiner),
    },
  };
}
