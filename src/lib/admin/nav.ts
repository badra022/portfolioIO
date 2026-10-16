/**
 * The teacher admin's menu: categories, each with its pages. Used by the side menu,
 * the phone menu and the breadcrumb (components/admin/AdminNav.tsx). Paths are
 * relative to <base>/admin; "" is the home page. Every editor page (SECTIONS in
 * lib/admin/sections.ts) belongs to exactly one category.
 */
export type NavItem = { label: string; path: string; badge?: "requests" | "grading" | "complaints"; superOnly?: boolean };
export type NavGroup = { id: string; label: string; icon: string; items: NavItem[] };

const edit = (id: string, label: string, extra: Partial<NavItem> = {}): NavItem => ({ label, path: `/edit/${id}`, ...extra });

export const NAV: NavGroup[] = [
  {
    id: "students", label: "الطلاب", icon: "users", items: [
      { label: "الطلبات", path: "/requests", badge: "requests" },
      { label: "الشكاوى والاقتراحات", path: "/complaints", badge: "complaints" },
      { label: "ملفات الطلاب", path: "/students" },
      { label: "الإحصائيات", path: "/analytics" },
    ],
  },
  {
    id: "exams", label: "الامتحانات", icon: "trophy", items: [
      edit("exams", "الامتحانات القادمة"),
      { label: "الاختبارات الأونلاين", path: "/quizzes", badge: "grading" },
      { label: "نتايج الامتحانات", path: "/results" },
      { label: "التصويتات", path: "/polls" },
    ],
  },
  {
    id: "site", label: "صفحات الموقع", icon: "home", items: [
      edit("hero", "الواجهة الرئيسية"),
      edit("schedule", "المواعيد"),
      edit("grades", "الصفوف والمواد"),
      edit("method", "طريقة الشرح"),
      edit("book", "الكتاب"),
      edit("honors", "لوحة الشرف"),
      edit("students", "صور الطلاب"),
      edit("reviews", "آراء الطلاب"),
      edit("challenge", "تحدي الأسئلة"),
      edit("youtube", "اليوتيوب"),
      edit("services", "خدمات أخرى"),
      edit("faq", "الأسئلة الشائعة"),
      edit("complaints", "صندوق الشكاوى"),
      edit("final", "الدعوة الأخيرة"),
      edit("layout", "ترتيب الأقسام والقوائم"),
    ],
  },
  {
    id: "marketing", label: "التسويق", icon: "megaphone", items: [
      edit("featured", "القسم المميز (عروض)"),
      edit("popup", "الإعلان المنبثق"),
      edit("bar", "الشريط الأحمر"),
      { label: "روابط الشركاء", path: "/referrals" },
      edit("forms", "نماذج جمع البيانات"),
    ],
  },
  {
    id: "settings", label: "الإعدادات", icon: "form", items: [
      edit("profile", "بياناتي وصورتي"),
      edit("contact", "التواصل وأرقام الهاتف"),
      edit("socials", "السوشيال ميديا"),
      edit("seo", "جوجل والمشاركة"),
      edit("general", "اللغة والنصوص العامة"),
      edit("theme", "الألوان والخطوط", { superOnly: true }),
      { label: "سجل التعديلات", path: "/history" },
    ],
  },
];

/** Editor pages reached from another page's own button (edit quizzes from «الاختبارات الأونلاين»...). */
const PARENT: Record<string, string> = { "/edit/quizzes": "/quizzes", "/edit/polls": "/polls", "/edit/referrals": "/referrals" };

/** The menu entry (and its category) for a path under /admin, for the active state and the breadcrumb. */
export function locate(rest: string): { group: NavGroup; item: NavItem } | null {
  const path = PARENT[rest] ?? rest;
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of NAV) {
    for (const item of group.items) {
      // The longest matching path wins: /quizzes/exam-oct belongs to «الاختبارات الأونلاين».
      if ((path === item.path || path.startsWith(`${item.path}/`)) && (!best || item.path.length > best.item.path.length)) best = { group, item };
    }
  }
  return best;
}
