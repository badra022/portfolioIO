/** "4 أكتوبر 2026، 3:15 م" in Cairo time, Latin digits. */
export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo",
  }).format(new Date(iso));
}
