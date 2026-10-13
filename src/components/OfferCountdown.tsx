"use client";
import { useEffect, useState } from "react";
import { deadline } from "@/lib/dates";

const n = (v: number) => String(v);

/** "ينتهي خلال ٢ يوم ٥ ساعة ١٢ دقيقة": time left until an end date (Cairo time), updated every 30 s. */
export function OfferCountdown({ until }: { until: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const end = deadline(until).getTime();
    const tick = () => setLeft(end - Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [until]);
  // Rendered in the browser only, so the cached page never shows a stale count.
  if (left === null || left <= 0) return null;
  const mins = Math.floor(left / 60_000);
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  return (
    <p className="ft-count" role="timer">
      <span>ينتهي خلال</span>
      {d > 0 && <b><span className="num">{n(d)}</span> يوم</b>}
      {(d > 0 || h > 0) && <b><span className="num">{n(h)}</span> ساعة</b>}
      {d === 0 && <b><span className="num">{n(m)}</span> دقيقة</b>}
    </p>
  );
}
