/**
 * Site analytics: what the browser sends and how it is counted. Shared by the
 * tracker (components/Tracker.tsx), the ingest route and the dashboard.
 *
 * Nothing personal is stored. The browser remembers on the device when it last
 * visited (localStorage) and says "first visit today / this month / ever", so the
 * server only keeps daily counters per teacher: no IPs, no cookies, no visitor ids.
 */
import { TIME_ZONE } from "./dates";

/** Where a link leads. */
export const CHANNELS = [
  "whatsapp", "telegram", "messenger", "phone",
  "youtube", "tiktok", "facebook", "instagram", "whatsappChannel", "x",
  "video", "link",
] as const;
export type ChannelT = (typeof CHANNELS)[number];

/** Clicks that open a conversation with the teacher. */
export const CONTACT: ReadonlySet<string> = new Set(["whatsapp", "telegram", "messenger", "phone"]);
/** Clicks that take the visitor to the teacher's channels. */
export const SOCIAL: ReadonlySet<string> = new Set(["youtube", "tiktok", "facebook", "instagram", "whatsappChannel", "x"]);

/** Conversion groups: a visitor converts once per group per period. */
export const GROUPS = ["any", "contact", "social"] as const;
export type GroupT = (typeof GROUPS)[number];
export const groupsOf = (ch: string): GroupT[] =>
  CONTACT.has(ch) ? ["any", "contact"] : SOCIAL.has(ch) ? ["any", "social"] : [];

/** Unique-visitor periods: first visit of the day, of the month, ever (on this device). */
export const PERIODS = ["d", "m", "e"] as const;
export type PeriodT = (typeof PERIODS)[number];

export const SOURCES = ["direct", "google", "facebook", "instagram", "youtube", "tiktok", "x", "telegram", "whatsapp", "other"] as const;
export const DEVICES = ["phone", "tablet", "desktop"] as const;
/** Page areas outside the sections that can hold buttons. */
export const PLACES = ["nav", "announce", "popup", "sticky", "footer"] as const;

/** Time on page buckets (seconds, upper bound exclusive). */
export const DWELL_BUCKETS: [number, string][] = [[10, "0-10"], [30, "10-30"], [120, "30-120"], [600, "120-600"], [Infinity, "600+"]];
export const MAX_DWELL = 30 * 60;
export const dwellBucket = (s: number) => DWELL_BUCKETS.find(([max]) => s < max)![1];

/** What the browser sends (one batch per request). */
export type TrackEvent =
  | { t: "view"; dev: string; src: string; u: PeriodT[] }
  | { t: "sec"; k: string }
  | { t: "click"; ch: string; at: string; u: Partial<Record<GroupT, PeriodT[]>> }
  | { t: "dwell"; s: number };

/** "2026-10-06" in Cairo, the day every counter is filed under. */
export function cairoDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

const HOST_CHANNEL: [RegExp, ChannelT][] = [
  [/^(wa\.me|api\.whatsapp\.com)$/, "whatsapp"],
  [/^whatsapp\.com$/, "whatsappChannel"],
  [/^t\.me$/, "telegram"],
  [/^m\.me$/, "messenger"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(x\.com|twitter\.com)$/, "x"],
];

/** Classifies a link. Links inside the page (#..., same site) return null: they aren't conversions. */
export function channelOf(href: string, pageHost: string): ChannelT | null {
  if (href.startsWith("tel:")) return "phone";
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");
  if (host === pageHost.replace(/^www\./, "")) return null;
  if (host === "whatsapp.com" && !url.pathname.startsWith("/channel")) return "whatsapp";
  return HOST_CHANNEL.find(([re]) => re.test(host))?.[1] ?? "link";
}

/** Where the visitor came from, from document.referrer and ?utm_source. */
export function sourceOf(referrer: string, utm: string | null, pageHost: string): (typeof SOURCES)[number] {
  const pick = (s: string) => {
    const v = s.toLowerCase();
    if (/google/.test(v)) return "google";
    if (/(facebook|fb\.|^fb$)/.test(v)) return "facebook";
    if (/instagram|^ig$/.test(v)) return "instagram";
    if (/youtu/.test(v)) return "youtube";
    if (/tiktok/.test(v)) return "tiktok";
    if (/(^|\.)(t\.co|x\.com|twitter)/.test(v) || v === "x") return "x";
    if (/telegram|^t\.me/.test(v)) return "telegram";
    if (/whatsapp|^wa\.me/.test(v)) return "whatsapp";
    return null;
  };
  if (utm) return pick(utm) ?? "other";
  if (!referrer) return "direct";
  let host = "";
  try { host = new URL(referrer).hostname.replace(/^www\./, ""); } catch { return "other"; }
  if (host === pageHost.replace(/^www\./, "")) return "direct";
  return pick(host) ?? "other";
}
