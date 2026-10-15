/** The admin editor's pages. Each edits some top-level keys of content.json, or the whole theme. */
export type SectionDef = {
  id: string;
  title: string;
  description: string;
  /** Top-level content keys edited on this page. */
  keys?: string[];
  /** Edits theme.json instead of content.json (super admin only). */
  theme?: boolean;
  superOnly?: boolean;
};

export const SECTIONS: SectionDef[] = [
  { id: "quizzes", title: "الاختبارات", description: "اختبارات بصفحة خاصة، أسئلة بصور، وقت، تواريخ، وإجابات صحيحة للتصحيح.", keys: ["quizzes"] },
  { id: "polls", title: "التصويتات", description: "تصويت من غير اسم ولا رقم بصفحة لوحده ورابط للستوري: عنوان، صور، اختيارات بصور، ومدة بعداد.", keys: ["polls"] },
  { id: "forms", title: "نماذج جمع البيانات", description: "نماذج تفتحها الأزرار بدل واتساب (الاسم، الرقم...). الردود في صفحة الطلبات.", keys: ["forms"] },
  { id: "bar", title: "الشريط الأحمر", description: "سطر إعلان أعلى الصفحة: امتحان، نتيجة، فيديو جديد... بتاريخ بداية ونهاية.", keys: ["bar"] },
  { id: "popup", title: "الإعلان المنبثق", description: "رسالة أو فيديو يظهر فوق الصفحة بعد فتحها، مع تاريخ انتهاء.", keys: ["popup"] },
  { id: "exams", title: "الامتحانات والجوائز", description: "إضافة امتحان، التاريخ، الجائزة، ونتايج الامتحانات اللي فاتت.", keys: ["exams"] },
  { id: "schedule", title: "جدول المواعيد", description: "المجموعات، الأيام، الساعات، المنطقة والسنتر، ورسائل الحجز.", keys: ["schedule"] },
  { id: "book", title: "الكتاب", description: "الغلاف، صفحات من داخل الكتاب، المميزات، ونموذج الطلب.", keys: ["book"] },
  { id: "youtube", title: "قناة اليوتيوب", description: "رابط القناة، الفيديوهات، وعدد المتابعين على المنصات.", keys: ["youtube"] },
  { id: "reviews", title: "آراء الطلاب", description: "صور رسائل وتقييمات الطلاب والرقم الكبير.", keys: ["reviews"] },
  { id: "featured", title: "قسم مميز (عروض وإعلانات)", description: "عرض لفترة محدودة، كورس جديد، فيديو، صورة، سعر، عداد تنازلي، وأزرار تواصل.", keys: ["featured"] },
  { id: "honors", title: "لوحة الشرف", description: "أوائل الطلاب ونتايجهم: صور (شبكة لو أكتر من صورة)، الدرجة، أيقونات، فيديو، وصف طويل، وزر.", keys: ["honors"] },
  { id: "faq", title: "الأسئلة الشائعة", description: "أسئلة الطلاب وأولياء الأمور وإجاباتها، وزر «لسه عندك سؤال؟».", keys: ["faq"] },
  { id: "services", title: "خدمات أخرى", description: "خدمات إضافية بصورة وزر تواصل (أي رقم أو تطبيق) وروابط.", keys: ["services"] },
  { id: "profile", title: "الملف الشخصي", description: "الاسم، اللقب، الصورة، واللوجو.", keys: ["profile"] },
  { id: "contact", title: "التواصل", description: "رقم الواتساب، أرقام الهاتف، وكود التتبع.", keys: ["contact"] },
  { id: "socials", title: "السوشيال ميديا", description: "روابط يوتيوب، تيك توك، فيسبوك... وعدد المتابعين وجملة لكل منصة.", keys: ["socials"] },
  { id: "hero", title: "الواجهة الرئيسية", description: "العنوان الكبير، الفقرة، الأزرار، والأرقام.", keys: ["hero"] },
  { id: "grades", title: "الصفوف والمواد", description: "المراحل والصفوف التي تدرّسها.", keys: ["grades"] },
  { id: "method", title: "طريقة الشرح", description: "النقاط التي تميزك.", keys: ["method"] },
  { id: "students", title: "الطلاب", description: "عدد الطلاب، صورة المجموعة، وصور الحصص والرحلات.", keys: ["students"] },
  { id: "challenge", title: "تحدي الأسئلة", description: "الأسئلة والجائزة لمن يحل صح على واتساب.", keys: ["challenge"] },
  { id: "final", title: "الدعوة الأخيرة", description: "آخر قسم قبل الفوتر.", keys: ["final"] },
  { id: "layout", title: "ترتيب الأقسام والقوائم", description: "الأقسام الظاهرة، قائمة الأقسام الجانبية، القائمة العلوية، الشريط السفلي، والفوتر.", keys: ["sections", "menu", "nav", "navCta", "sticky", "footer"] },
  { id: "seo", title: "جوجل والمشاركة", description: "عنوان ووصف الموقع في جوجل وصورة المشاركة.", keys: ["seo"] },
  { id: "general", title: "اللغة والنصوص العامة", description: "لغة الموقع (عربي أو إنجليزي) وأسماء الأيام.", keys: ["locale", "labels"] },
  { id: "theme", title: "الهوية البصرية", description: "الألوان والخطوط وشكل الصور.", theme: true, superOnly: true },
];

export const sectionById = (id: string) => SECTIONS.find((s) => s.id === id);
