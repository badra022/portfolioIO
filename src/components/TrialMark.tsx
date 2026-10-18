"use client";

import { useEffect, useState } from "react";
import { BRAND, DEVELOPER } from "@/lib/platform";
import { OstazLogo } from "./brand/OstazLogo";

/**
 * Free trial sites only (app/sites/[site]/layout.tsx): a bar at the top and the
 * bottom of every page saying it's a trial of myostaz.com, with the time left. The
 * teacher's own photos stay clean; the sample images carry the myostaz.com mark
 * themselves (public/demo). Images can't be saved with a right click or a long
 * press either (a deterrent, not a lock).
 */
export function TrialMark({ endsAt, en, siteName, foot = false }: { endsAt: string; en: boolean; siteName: string; foot?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    if (foot) return () => clearInterval(t);
    const block = (e: Event) => { if ((e.target as HTMLElement | null)?.closest?.("img, picture, video, .hero-photo")) e.preventDefault(); };
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    return () => { clearInterval(t); document.removeEventListener("contextmenu", block); document.removeEventListener("dragstart", block); };
  }, [foot]);
  const mins = now === null ? null : Math.max(0, Math.round((Date.parse(endsAt) - now) / 60_000));
  const left = mins === null ? "" : mins >= 60
    ? (en ? `${Math.floor(mins / 60)} h left` : `باقي ${Math.floor(mins / 60)} ساعة`)
    : (en ? `${mins} min left` : `باقي ${mins} دقيقة`);
  const msg = encodeURIComponent(en ? `Hi, I want to activate my site (${siteName}).` : `مرحباً، عايز أفعّل موقعي (${siteName}).`);
  return (
    <div className={foot ? "trial-bar foot" : "trial-bar"} role="note" dir={en ? "ltr" : "rtl"}>
      <span className="trial-tag">{en ? "Trial version" : "نسخة تجريبية"}</span>
      <OstazLogo size={18} href={BRAND.home} />
      {left && <span className="trial-left">{left}</span>}
      <a className="trial-cta" href={`https://wa.me/${DEVELOPER.whatsapp}?text=${msg}`} target="_blank" rel="noopener noreferrer">{en ? "Activate my site" : "فعّل موقعك"}</a>
    </div>
  );
}
