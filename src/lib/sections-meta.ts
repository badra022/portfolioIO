import type { Content } from "./schema";

type Key = Content["sections"][number];

/** Each section's anchor on the page, short name and icon, for the sections menu. */
export const SECTION_META: Record<Key, { id: string; label: string; icon: string }> = {
  hero: { id: "top", label: "الرئيسية", icon: "home" },
  featured: { id: "featured", label: "عروض وإعلانات", icon: "gift" },
  grades: { id: "grades", label: "الصفوف والمواد", icon: "book" },
  schedule: { id: "schedule", label: "المواعيد", icon: "calendar" },
  method: { id: "method", label: "طريقة الشرح", icon: "check" },
  book: { id: "book", label: "الكتاب", icon: "book" },
  students: { id: "students", label: "الطلاب", icon: "users" },
  reviews: { id: "reviews", label: "آراء الطلاب", icon: "star" },
  challenge: { id: "challenge", label: "التحدي", icon: "bolt" },
  exams: { id: "exams", label: "الامتحانات", icon: "trophy" },
  youtube: { id: "youtube", label: "الفيديوهات", icon: "youtube" },
  services: { id: "services", label: "خدمات أخرى", icon: "link" },
  faq: { id: "faq", label: "أسئلة شائعة", icon: "help" },
  final: { id: "final", label: "تواصل معانا", icon: "phone" },
};

export type MenuItem = { id: string; label: string; icon: string };

/**
 * The menu's entries: the teacher's own list (names, order) when set, else every
 * section on the page in order. Sections that show nothing are left out.
 */
export function menuItems(c: Content, shown: (key: Key) => boolean): MenuItem[] {
  const own = c.menu.items;
  const list = own.length ? own : c.sections.map((section) => ({ section, label: undefined }));
  const seen = new Set<Key>();
  return list.flatMap(({ section, label }) => {
    if (seen.has(section) || !c.sections.includes(section) || !shown(section)) return [];
    seen.add(section);
    const m = SECTION_META[section];
    return [{ id: m.id, label: label?.trim() || m.label, icon: m.icon }];
  });
}
