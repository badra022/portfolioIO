import type { PollT } from "./schema";
import { instantOf } from "./dates";

/** What the vote page needs to know about its timing. Same answer on the server and in the browser. */
export type PollWindow = Pick<PollT, "state" | "startsAt" | "durationHours">;

/** When the vote opens and closes (ms since epoch); end is null when it has no end. */
export function pollTimes(p: PollWindow): { start: number | null; end: number | null } {
  const start = p.startsAt ? instantOf(p.startsAt).getTime() : null;
  const end = start !== null && p.durationHours > 0 ? start + p.durationHours * 3_600_000 : null;
  return { start, end };
}

export type PollStatus = { open: true; end: number | null } | { open: false; reason: "closed" | "notYet" | "over"; at?: number };

/** Whether the vote takes votes now. "open" = open with no end; "closed" = closed whatever the dates. */
export function pollStatus(p: PollWindow, now = Date.now()): PollStatus {
  if (p.state === "closed") return { open: false, reason: "closed" };
  if (p.state === "open") return { open: true, end: null };
  const { start, end } = pollTimes(p);
  if (start !== null && now < start) return { open: false, reason: "notYet", at: start };
  if (end !== null && now >= end) return { open: false, reason: "over" };
  return { open: true, end };
}

/** "2026-10-13T21:40" in Cairo time, for a vote whose countdown starts when it's saved. */
export function cairoNow(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(now).replace(" ", "T");
}

/** Votes with a duration but no start get "now" as their start, so the countdown is the same for everyone. */
export function stampPolls<T extends { polls: PollT[] }>(content: T, now = new Date()): T {
  if (!content.polls.some((p) => !p.startsAt)) return content;
  const at = cairoNow(now);
  return { ...content, polls: content.polls.map((p) => (p.startsAt ? p : { ...p, startsAt: at })) };
}
