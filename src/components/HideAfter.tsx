"use client";
import { useEffect, useState } from "react";
import { deadline } from "@/lib/dates";

/**
 * Hides its children once an end date passes, in the visitor's browser. The server
 * already drops expired content, but a cached page can be up to an hour old.
 */
export function HideAfter({ until, children }: { until?: string; children: React.ReactNode }) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!until) return;
    const end = deadline(until).getTime();
    const check = () => setOver(Date.now() >= end);
    check();
    const ms = end - Date.now();
    if (ms > 0 && ms < 2 ** 31 - 1) {
      const t = setTimeout(check, ms);
      return () => clearTimeout(t);
    }
  }, [until]);
  return over ? null : <>{children}</>;
}
