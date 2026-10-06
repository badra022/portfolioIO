/**
 * Dates typed in the admin are Cairo wall-clock dates. Servers (and some visitors)
 * run in other time zones, so "ends on 2026-10-10" must mean the end of that day
 * in Cairo, not in UTC. Works the same on the server and in the browser.
 */
export const TIME_ZONE = "Africa/Cairo";

/** Accepted by the admin: "2026-10-10" or "2026-10-10T18:00" (optionally with seconds and an offset or Z). */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?)?$/;

function offsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "shortOffset" })
    .formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -minutes : minutes;
}

/** The instant at which Cairo's clock shows the given wall-clock time. */
function cairoWallClock(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = asUtc - offsetMinutes(new Date(asUtc)) * 60_000;
  const corrected = asUtc - offsetMinutes(new Date(t)) * 60_000; // across a DST switch
  if (corrected !== t) t = corrected;
  return new Date(t);
}

/** The instant a date/datetime string refers to (date-only = start of that day in Cairo). */
export function instantOf(value: string): Date {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:\d{2})?$/);
  if (!m) return new Date(value);
  if (m[7]) return new Date(value);
  return cairoWallClock(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}

/** Cairo calendar day of a date/datetime string. */
function cairoDay(value: string): [number, number, number] {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return [y, m, d];
  }
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(instantOf(value));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return [get("year"), get("month"), get("day")];
}

/** Midnight (Cairo) at the end of the day the value falls on. */
export function endOfDay(value: string): Date {
  const [y, m, d] = cairoDay(value);
  return cairoWallClock(y, m, d + 1);
}

/** When an "ends at" value expires: a date means the whole day, a datetime means that exact time. */
export function deadline(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? endOfDay(value) : instantOf(value);
}

export const isOver = (end: Date, now: Date = new Date()) => now.getTime() >= end.getTime();
