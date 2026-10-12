"use client";
import { useEffect, useState } from "react";
import { deadline, instantOf } from "@/lib/dates";
import { Icon } from "./Icon";

/** One message of the red bar, ready to show (see TenantPage barItems). */
export type BarMessage = { text: string; icon: string; href?: string; external?: boolean; from?: string; until?: string };

const activeAt = (m: BarMessage, t: number) =>
  (!m.from || t >= instantOf(m.from).getTime()) && (!m.until || t < deadline(m.until).getTime());

/**
 * The red bar at the very top of the page. Shows the first message whose dates
 * are current. The server already leaves out what's over or not started, but a
 * cached page can be up to an hour old, so the switch also happens in the browser.
 */
export function AnnouncementBar({ messages }: { messages: BarMessage[] }) {
  // First render (server and browser alike): the first message without a start date.
  const [at, setAt] = useState(() => messages.findIndex((m) => !m.from));
  useEffect(() => {
    const pick = () => setAt(messages.findIndex((m) => activeAt(m, Date.now())));
    pick();
    const now = Date.now();
    const timers = messages
      .flatMap((m) => [m.from ? instantOf(m.from).getTime() : 0, m.until ? deadline(m.until).getTime() : 0])
      .map((t) => t - now)
      .filter((ms) => ms > 0 && ms < 2 ** 31 - 1)
      .map((ms) => setTimeout(pick, ms + 50));
    return () => timers.forEach(clearTimeout);
  }, [messages]);

  const m = messages[at];
  if (!m) return null;
  const body = (
    <>
      <Icon name={m.icon} />
      <span>{m.text}</span>
      {m.href && <span className="announce-arrow" aria-hidden="true">←</span>}
    </>
  );
  if (!m.href) return <div className="announce">{body}</div>;
  return m.external
    ? <a className="announce" href={m.href} target="_blank" rel="noopener noreferrer">{body}</a>
    : <a className="announce" href={m.href}>{body}</a>;
}
