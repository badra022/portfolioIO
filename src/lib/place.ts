/** Where on the page an element sits: a section key, or one of the fixed areas. Browser only. */
export function placeOf(el: Element): string | null {
  const slot = el.closest(".section-slot");
  const m = slot?.className.match(/\bslot-([a-z]+)/);
  if (m) return m[1];
  if (el.closest(".pop")) return "popup";
  if (el.closest(".announce")) return "announce";
  if (el.closest(".sticky")) return "sticky";
  if (el.closest(".nav")) return "nav";
  if (el.closest(".footer")) return "footer";
  return null;
}
