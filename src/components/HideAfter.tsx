"use client";
import { useEffect, useState } from "react";
import { deadline, instantOf } from "@/lib/dates";

/**
 * Shows its children only between a start and an end date, checked in the
 * visitor's browser. The server already leaves out what's over or far off, but a
 * cached page can be up to an hour old, so this switches on and off on time.
 * Without a start date it renders on the server (no flash); with one it appears
 * once the browser confirms the time has come.
 */
export function HideAfter({ until, from, children }: { until?: string; from?: string; children: React.ReactNode }) {
  const [on, setOn] = useState(!from);
  useEffect(() => {
    const start = from ? instantOf(from).getTime() : -Infinity;
    const end = until ? deadline(until).getTime() : Infinity;
    const check = () => { const t = Date.now(); setOn(t >= start && t < end); };
    check();
    const timers = [start, end]
      .map((at) => at - Date.now())
      .filter((ms) => ms > 0 && ms < 2 ** 31 - 1)
      .map((ms) => setTimeout(check, ms + 50));
    return () => timers.forEach(clearTimeout);
  }, [until, from]);
  return on ? <>{children}</> : null;
}
