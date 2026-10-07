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
  { id: "forms", title: "نماذج جمع البيانات", description: "نماذج تفتحها الأزرار بدل واتساب (الاسم، الرقم...). الردود في صفحة الطلبات.", keys: ["forms"] },
  { id: "popup", title: "الإعلان المنبثق", description: "رسالة أو فيديو يظهر فوق الصفحة بعد فتحها، مع تاريخ انتهاء.", keys: ["popup"] },
  { id: "exams", title: "الامتحانات والجوائز", description: "إضافة امتحان، التاريخ، الجائزة، والشريط الأحمر.", keys: ["exams"] },
  { id: "schedule", title: "جدول المواعيد", description: "المجموعات، الأيام، الساعات، المنطقة والسنتر، ورسائل الحجز.", keys: ["schedule"] },
  { id: "book", title: "الكتاب", description: "الغلاف، صفحات من داخل الكتاب، المميزات، ونموذج الطلب.", keys: ["book"] },
  { id: "youtube", title: "قناة اليوتيوب", description: "رابط القناة، الفيديوهات، وعدد المتابعين على المنصات.", keys: ["youtube"] },
  { id: "reviews", title: "آراء الطلاب", description: "صور رسائل وتقييمات الطلاب والرقم الكبير.", keys: ["reviews"] },
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
  { id: "layout", title: "ترتيب الأقسام والقوائم", description: "الأقسام الظاهرة، القائمة العلوية، الشريط السفلي، والفوتر.", keys: ["sections", "nav", "navCta", "sticky", "footer"] },
  { id: "seo", title: "جوجل والمشاركة", description: "عنوان ووصف الموقع في جوجل وصورة المشاركة.", keys: ["seo"] },
  { id: "general", title: "اللغة والنصوص العامة", description: "اللغة، الاتجاه، وأسماء الأيام.", keys: ["locale", "dir", "labels"] },
  { id: "theme", title: "الهوية البصرية", description: "الألوان والخطوط وشكل الصور.", theme: true, superOnly: true },
];

export const sectionById = (id: string) => SECTIONS.find((s) => s.id === id);
