/**
 * The teacher admin's menu: categories, each split into small groups of pages (at
 * most 4 per list, so nothing gets long). Used by the side menu, the phone menu and
 * the breadcrumb (components/admin/AdminNav.tsx). Paths are relative to
 * <base>/admin; "" is the home page. Every editor page (SECTIONS in
 * lib/admin/sections.ts) belongs to exactly one group, except «structure» which
 * lives on the home page.
 */
export type NavItem = { label: string; path: string; badge?: "requests" | "grading" | "complaints"; superOnly?: boolean };
export type NavSub = { id: string; label: string; items: NavItem[] };
export type NavGroup = { id: string; label: string; icon: string; subs: NavSub[] };

const edit = (id: string, label: string, extra: Partial<NavItem> = {}): NavItem => ({ label, path: `/edit/${id}`, ...extra });

export const NAV: NavGroup[] = [
  {
    id: "students", label: "الطلاب والامتحانات", icon: "users", subs: [
      {
        id: "people", label: "الطلاب", items: [
          { label: "الطلبات", path: "/requests", badge: "requests" },
          { label: "الشكاوى والاقتراحات", path: "/complaints", badge: "complaints" },
          { label: "ملفات الطلاب", path: "/students" },
          { label: "الإحصائيات", path: "/analytics" },
        ],
      },
      {
        id: "exams", label: "الامتحانات", items: [
          edit("exams", "الامتحانات القادمة"),
          { label: "الاختبارات الأونلاين", path: "/quizzes", badge: "grading" },
          { label: "نتايج الامتحانات", path: "/results" },
          { label: "التصويتات", path: "/polls" },
        ],
      },
    ],
  },
  {
    id: "site", label: "أقسام الموقع", icon: "home", subs: [
      {
        id: "about", label: "التعريف بيك", items: [
          edit("hero", "الواجهة الرئيسية"),
          edit("grades", "الصفوف والمواد"),
          edit("method", "طريقة الشرح"),
          edit("final", "الدعوة الأخيرة"),
        ],
      },
      {
        id: "booking", label: "المواعيد والحجز", items: [
          edit("schedule", "المواعيد"),
          edit("book", "الكتاب"),
          edit("services", "خدمات أخرى"),
        ],
      },
      {
        id: "proof", label: "النتايج والآراء", items: [
          edit("honors", "لوحة الشرف"),
          edit("students", "صور الطلاب"),
          edit("reviews", "آراء الطلاب"),
        ],
      },
      {
        id: "interactive", label: "تفاعل مع الطلاب", items: [
          edit("faq", "الأسئلة الشائعة"),
          edit("challenge", "تحدي الأسئلة"),
          edit("youtube", "اليوتيوب"),
          edit("complaints", "صندوق الشكاوى"),
        ],
      },
    ],
  },
  {
    id: "marketing", label: "التسويق", icon: "megaphone", subs: [
      {
        id: "ads", label: "الإعلانات", items: [
          edit("featured", "القسم المميز (عروض)"),
          edit("popup", "الإعلان المنبثق"),
          edit("bar", "الشريط الأحمر"),
        ],
      },
      {
        id: "leads", label: "جمع الطلاب", items: [
          { label: "الصفحات (عروض وطلبات)", path: "/pages" },
          { label: "روابط الشركاء", path: "/referrals" },
          edit("forms", "نماذج جمع البيانات"),
        ],
      },
    ],
  },
  {
    id: "settings", label: "الإعدادات", icon: "form", subs: [
      {
        id: "me", label: "بياناتك", items: [
          edit("profile", "بياناتي وصورتي"),
          edit("contact", "التواصل وأرقام الهاتف"),
          edit("socials", "السوشيال ميديا"),
        ],
      },
      {
        id: "look", label: "شكل الموقع", items: [
          edit("layout", "القوائم والفوتر"),
          edit("theme", "الألوان والخطوط", { superOnly: true }),
          edit("general", "اللغة والنصوص العامة"),
        ],
      },
      {
        id: "advanced", label: "متقدم", items: [
          edit("pages", "إعداد الصفحات"),
          edit("seo", "جوجل والمشاركة"),
          { label: "سجل التعديلات", path: "/history" },
        ],
      },
    ],
  },
];

/** Editor pages reached from another page's own button (edit quizzes from «الاختبارات الأونلاين»...). */
const PARENT: Record<string, string> = { "/edit/quizzes": "/quizzes", "/edit/polls": "/polls", "/edit/referrals": "/referrals" };

export type Located = { group: NavGroup; sub: NavSub; item: NavItem };

/** The menu entry (with its category and group) for a path under /admin, for the active state and the breadcrumb. */
export function locate(rest: string): Located | null {
  const path = PARENT[rest] ?? rest;
  let best: Located | null = null;
  for (const group of NAV) {
    for (const sub of group.subs) {
      for (const item of sub.items) {
        // The longest matching path wins: /quizzes/exam-oct belongs to «الاختبارات الأونلاين».
        if ((path === item.path || path.startsWith(`${item.path}/`)) && (!best || item.path.length > best.item.path.length)) best = { group, sub, item };
      }
    }
  }
  return best;
}
