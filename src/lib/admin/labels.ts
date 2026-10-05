/**
 * Arabic labels and hints for the admin forms. Forms are generated from the Zod
 * schemas, so a new field only needs a label here (it falls back to the key name).
 *
 * Lookup order: exact path ("hero.primaryCta.message"), then generic path with
 * array indexes removed ("exams.items.title"), then the bare key ("title").
 */

const BY_KEY: Record<string, string> = {
  // common
  eyebrow: "عنوان صغير فوق القسم",
  title: "العنوان",
  intro: "مقدمة القسم",
  text: "النص",
  label: "النص الظاهر",
  message: "رسالة الواتساب الجاهزة",
  ref: "كود تتبع الزر",
  href: "الرابط",
  url: "الرابط",
  cta: "زر التواصل",
  name: "الاسم",
  id: "المعرّف (بالإنجليزي، بدون مسافات)",
  note: "ملاحظة",
  style: "شكل النص",
  value: "القيمة",
  prefix: "علامة قبل الرقم",
  caption: "وصف قصير",
  // profile
  profile: "الملف الشخصي",
  fullTitle: "اللقب الكامل",
  latinName: "الاسم بالإنجليزي",
  role: "الوصف المهني",
  photo: "الصورة",
  avatar: "صورة مصغّرة (أيقونة)",
  logo: "اللوجو",
  photoBadge: "شارة على الصورة",
  replyNote: "ملاحظة الرد",
  // contact
  contact: "التواصل",
  primary: "تطبيق التواصل الأساسي",
  whatsapp: "رقم الواتساب (دولي بدون +، مثل 2010...)",
  telegram: "اسم مستخدم تيليجرام",
  messenger: "اسم صفحة فيسبوك (ماسنجر)",
  phones: "أرقام الهاتف الظاهرة",
  phoneHighlights: "تلوين أرقام معيّنة (متقدم)",
  refCodes: "إضافة كود تتبع للرسائل",
  refLabel: "كلمة الكود في الرسالة",
  // socials / nav
  socials: "روابط السوشيال ميديا",
  type: "المنصة",
  nav: "روابط القائمة العلوية",
  navCta: "زر القائمة العلوية",
  sections: "الأقسام الظاهرة وترتيبها",
  seo: "جوجل والمشاركة",
  description: "الوصف",
  ogImage: "صورة المشاركة (واتساب/فيسبوك)",
  locale: "اللغة (مثل ar-EG)",
  dir: "اتجاه الكتابة",
  slug: "المعرّف",
  // hero
  hero: "الواجهة الرئيسية",
  kicker: "سطر فوق العنوان",
  headline: "العنوان الرئيسي (كل عنصر سطر)",
  lede: "الفقرة التعريفية",
  primaryCta: "الزر الأساسي",
  secondaryCta: "الزر الثانوي",
  stats: "الأرقام",
  // grades
  grades: "الصفوف والمواد",
  stages: "المراحل",
  items: "العناصر",
  subject: "المادة",
  // schedule
  schedule: "جدول المواعيد",
  location: "المكان",
  filters: "أزرار التصفية",
  stage: "المرحلة",
  day: "اليوم",
  labels: "نصوص ثابتة",
  slots: "المواعيد",
  grade: "الصف",
  days: "الأيام",
  time: "الساعة",
  mode: "نوع الحصة (سنتر/أونلاين)",
  messages: "رسائل الواتساب",
  all: "الكل",
  pm: "مساءً",
  am: "صباحاً",
  tbd: "لم يحدد بعد",
  empty: "لا توجد مواعيد",
  book: "حجز",
  ask: "استفسار",
  // method
  method: "طريقة الشرح",
  icon: "الأيقونة",
  // book
  seriesName: "اسم السلسلة",
  cover: "صورة الغلاف",
  backCover: "الغلاف الخلفي",
  coverAlt: "وصف الغلاف (لجوجل وقارئ الشاشة)",
  features: "المميزات",
  order: "نموذج طلب الكتاب",
  gradeLabel: "عنوان اختيار الصف",
  deliveryLabel: "عنوان طريقة الاستلام",
  delivery: "طرق الاستلام",
  notePhone: "رقم يظهر مع الملاحظة",
  // students
  students: "الطلاب",
  count: "عدد الطلاب",
  gallery: "صور مع الطلاب (حصص، رحلات، ماتشات)",
  image: "الصورة",
  alt: "وصف الصورة (لجوجل وقارئ الشاشة)",
  pages: "صفحات من داخل الكتاب",
  pagesTitle: "عنوان فوق صفحات الكتاب",
  area: "المنطقة",
  center: "السنتر",
  // challenge
  challenge: "تحدي الأسئلة",
  sendLabel: "نص زر الإرسال",
  questions: "الأسئلة",
  level: "المستوى",
  question: "السؤال",
  options: "الاختيارات",
  draft: "سؤال تجريبي (غير نهائي)",
  // exams
  exams: "الامتحانات",
  date: "التاريخ",
  featured: "إعلان مميز (شريط أحمر وعداد)",
  place: "المكان",
  fee: "الرسوم",
  prize: "الجائزة",
  tracks: "المستويات/الصفوف",
  scope: "المقرر",
  announcement: "نص الشريط الأحمر ({date} = التاريخ)",
  trackLabel: "عنوان اختيار المستوى",
  countdown: "عنوان العداد",
  hours: "ساعات",
  minutes: "دقائق",
  today: "النهاردة",
  // youtube
  youtube: "قناة اليوتيوب",
  channelName: "اسم القناة",
  channelUrl: "رابط القناة",
  subscribeLabel: "نص زر الاشتراك",
  videos: "الفيديوهات",
  // final / footer / sticky
  final: "الدعوة الأخيرة",
  footer: "الفوتر",
  hashtags: "الهاشتاجات",
  sticky: "الشريط السفلي الثابت",
  secondary: "الزر الثانوي",
  daysJoiner: "فاصل الأيام",
  sat: "السبت", sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة",
  // theme
  scheme: "الوضع",
  colors: "الألوان",
  bg: "الخلفية", surface: "خلفية البطاقات", raised: "خلفية مرتفعة", line: "الخطوط الفاصلة",
  accent: "اللون الأساسي", accentHot: "اللون الأساسي (عند التمرير)", accentDeep: "اللون الأساسي الداكن", onAccent: "لون النص فوق الأساسي",
  muted: "نص ثانوي", subtle: "نص باهت", online: "لون أونلاين",
  fonts: "الخطوط", googleFontsHref: "رابط Google Fonts", display: "خط العناوين", body: "خط النصوص", numeric: "خط الأرقام",
  radius: "استدارة الحواف", card: "البطاقات", control: "الحقول", pill: "الأزرار",
  texture: "ملمس الخلفية", glow: "توهج الخلفية", heroPhotoShape: "شكل صورة الواجهة", tagRotation: "ميل الكلمة المميزة", buttonGlow: "توهج الأزرار",
};

const BY_PATH: Record<string, string> = {
  "contact.primary": "تطبيق التواصل الأساسي",
  "schedule.labels.book": "نص زر الحجز",
  "schedule.labels.ask": "نص زر الاستفسار",
  "schedule.labels.stage": "عنوان تصفية المرحلة",
  "schedule.labels.day": "عنوان تصفية اليوم",
  "schedule.messages.book": "رسالة الحجز",
  "schedule.messages.ask": "رسالة الاستفسار",
  "schedule.filters.stage": "تصفية بالمرحلة",
  "schedule.filters.day": "تصفية باليوم",
  "schedule.filters.area": "تصفية بالمنطقة",
  "schedule.labels.area": "عنوان تصفية المنطقة",
  "schedule.location": "المكان الافتراضي",
  "challenge.prize": "الجائزة (سطر مميز في القسم)",
  "youtube.videos.id": "رابط الفيديو",
  "youtube.videos.title": "عنوان الفيديو",
  "schedule.slots.stage": "المرحلة (معرّف المرحلة من قسم الصفوف)",
  "exams.labels.days": "أيام",
  "exams.labels.scope": "عنوان المقرر",
  "exams.labels.prize": "عنوان الجائزة",
  "exams.items.cta": "نص زر الحجز",
  "exams.items.title": "اسم الامتحان",
  "exams.items.message": "رسالة الحجز",
  "book.order.grades": "الصفوف المتاحة",
  "book.order.cta": "نص زر الطلب",
  "book.order.message": "رسالة الطلب",
  "book.order.whatsapp": "رقم واتساب خاص بالطلبات (اختياري)",
  "book.order.title": "عنوان النموذج",
  "book.features.value": "الرقم/القيمة",
  "book.features.label": "الوصف",
  "hero.stats.value": "الرقم",
  "hero.stats.label": "الوصف",
  "grades.stages.items": "الصفوف",
  "grades.stages.items.name": "الصف",
  "labels.days": "أسماء الأيام",
  "sticky.cta": "الزر الأساسي",
  // theme page (its fields sit at the root of the form)
  "name": "اسم الهوية",
  "colors.text": "لون النص",
  "challenge.message": "رسالة إرسال الإجابة",
};

const HINTS: Record<string, string> = {
  "schedule.messages.book": "يمكن استخدام {grade} و{subject} و{days} و{time} و{location} (السنتر) و{area} (المنطقة).",
  "schedule.messages.ask": "تُستخدم للمواعيد التي لم تحدد ساعتها. يمكن استخدام {grade} و{subject} و{location} (السنتر) و{area} (المنطقة).",
  "schedule.location": "يظهر للمجموعات اللي مش محدد لها سنتر.",
  "schedule.slots.area": "مثل: فيصل. يظهر في كارت المجموعة وفي أزرار التصفية.",
  "schedule.slots.center": "مثل: سنتر الأوائل. لو فاضي يُستخدم المكان الافتراضي.",
  "schedule.filters.area": "تظهر فقط لو المجموعات في أكتر من منطقة.",
  "students.gallery": "تظهر تحت القسم، والزائر يقدر يكبّر أي صورة.",
  "book.pages": "صور لصفحات من جوه الكتاب عشان الطالب يشوف شكل الشرح. الزائر يقدر يكبّرها.",
  "challenge.prize": "مثال: حل صح وابعت إجابتك على واتساب واكسب ... يمكن استخدامها في الرسالة بـ {prize}.",
  "youtube.videos.id": "الصق رابط الفيديو من يوتيوب (أي شكل: watch أو youtu.be أو shorts).",
  "exams.items.message": "يمكن استخدام {date} و{track} و{scope}.",
  "exams.items.date": "يختفي الامتحان من الموقع تلقائياً بعد يومه.",
  "exams.items.id": "مثال: OCT-U1. يظهر في كود التتبع.",
  "book.order.message": "يمكن استخدام {grade} و{delivery}.",
  "challenge.message": "يمكن استخدام {n} (رقم السؤال) و{answer} (الإجابة) و{prize} (الجائزة).",
  "contact.whatsapp": "مثال: 201009719950",
  "contact.refCodes": "يضيف (كود: XXX) لآخر الرسالة لتعرف أي زر استخدمه الطالب.",
  "sections": "الترتيب هنا هو ترتيب ظهور الأقسام في الموقع.",
  "seo.title": "يظهر في جوجل وفي عنوان التبويب. الأفضل أقل من 60 حرف.",
  "seo.description": "يظهر تحت العنوان في جوجل. الأفضل 120-160 حرف.",
  "hero.headline": "كل عنصر سطر. يمكن تمييز كلمة بلون أو بإطار.",
  "students.photo": "اختياري. بدون صورة يظهر الرقم فقط.",
  "nav.href": "مثل #schedule للانتقال لقسم في الصفحة.",
  "contact.phoneHighlights": "بصيغة JSON: رقم الهاتف ← مواضع الأرقام الملوّنة.",
};

const ENUMS: Record<string, string> = {
  rtl: "من اليمين لليسار", ltr: "من اليسار لليمين",
  whatsapp: "واتساب", telegram: "تيليجرام", messenger: "ماسنجر",
  youtube: "يوتيوب", tiktok: "تيك توك", facebook: "فيسبوك", instagram: "إنستجرام", whatsappChannel: "قناة واتساب", x: "إكس (تويتر)",
  accent: "ملوّن", tag: "داخل إطار", strong: "عريض",
  hero: "الواجهة", grades: "الصفوف", schedule: "الجدول", method: "طريقة الشرح", book: "الكتاب", students: "الطلاب",
  challenge: "التحدي", exams: "الامتحانات", final: "الدعوة الأخيرة",
  sat: "السبت", sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة",
  chat: "محادثة", check: "علامة صح", loop: "تكرار", trophy: "كأس", bolt: "برق", star: "نجمة", users: "طلاب",
  dark: "داكن", light: "فاتح", grain: "حبيبات", none: "بدون", blob: "شكل حر", rounded: "حواف مستديرة", circle: "دائرة",
};

const generic = (path: string) => path.split(".").filter((p) => !/^\d+$/.test(p)).join(".");

export function labelFor(path: string, key: string): string {
  const g = generic(path);
  return BY_PATH[path] ?? BY_PATH[g] ?? BY_KEY[key] ?? key;
}

export function hintFor(path: string): string | undefined {
  return HINTS[path] ?? HINTS[generic(path)];
}

export function enumLabel(value: string): string {
  if (value === "book") return "كتاب";
  return ENUMS[value] ?? value;
}

export const sectionEnumLabel = (value: string) => (value === "book" ? "الكتاب" : enumLabel(value));
