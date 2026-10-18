"use client";
import { useEffect, useState } from "react";
import { deadline } from "@/lib/dates";

/** Shows its content once an end date (as HideAfter's `until` reads it) has passed. */
export function AfterDeadline({ at, children }: { at: string; children: React.ReactNode }) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const end = deadline(at).getTime();
    const check = () => setPast(Date.now() >= end);
    check();
    const ms = end - Date.now();
    if (ms <= 0 || ms >= 2 ** 31 - 1) return;
    const timer = setTimeout(check, ms + 50);
    return () => clearTimeout(timer);
  }, [at]);
  return past ? <>{children}</> : null;
}
