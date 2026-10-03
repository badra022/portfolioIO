/** "14:30" -> { clock: "2:30", period: "م" } */
export function formatTime(hhmm: string, am: string, pm: string): { clock: string; period: string } {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { clock: `${h12}:${String(m).padStart(2, "0")}`, period: h >= 12 ? pm : am };
}

/** Always Latin digits, matching the printed material. */
function loc(locale: string) {
  return `${locale}-u-nu-latn`;
}

/** Date-only strings are treated as local Cairo-style dates (no TZ shift). */
export function parseDate(iso: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
}

export function dateParts(iso: string, locale: string) {
  const d = parseDate(iso);
  return {
    day: new Intl.DateTimeFormat(loc(locale), { day: "numeric" }).format(d),
    month: new Intl.DateTimeFormat(loc(locale), { month: "long" }).format(d),
    weekday: new Intl.DateTimeFormat(loc(locale), { weekday: "long" }).format(d),
    short: new Intl.DateTimeFormat(loc(locale), { weekday: "long", day: "numeric", month: "long" }).format(d),
  };
}
