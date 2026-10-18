"use client";

import { useEffect, useState } from "react";
import { BRAND, DEVELOPER } from "@/lib/platform";
import { OstazLogo } from "./brand/OstazLogo";

/**
 * Free trial sites only (app/sites/[site]/layout.tsx): a bar saying it's a trial
 * of ostaz.com with the time left, and a light ostaz.com watermark over the whole
 * page, so screenshots carry the platform's name. Images can't be saved with a
 * right click or a long press either (a deterrent, not a lock).
 */
export function TrialMark({ endsAt, en, siteName }: { endsAt: string; en: boolean; siteName: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    const block = (e: Event) => { if ((e.target as HTMLElement | null)?.closest?.("img, picture, video, .hero-photo")) e.preventDefault(); };
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    return () => { clearInterval(t); document.removeEventListener("contextmenu", block); document.removeEventListener("dragstart", block); };
  }, []);
  const mins = now === null ? null : Math.max(0, Math.round((Date.parse(endsAt) - now) / 60_000));
  const left = mins === null ? "" : mins >= 60
    ? (en ? `${Math.floor(mins / 60)} h left` : `باقي ${Math.floor(mins / 60)} ساعة`)
    : (en ? `${mins} min left` : `باقي ${mins} دقيقة`);
  const msg = encodeURIComponent(en ? `Hi, I want to activate my site (${siteName}).` : `مرحباً، عايز أفعّل موقعي (${siteName}).`);
  return (
    <>
      <div className="trial-bar" role="note" dir={en ? "ltr" : "rtl"}>
        <span className="trial-tag">{en ? "Trial version" : "نسخة تجريبية"}</span>
        <OstazLogo size={18} href={BRAND.home} />
        {left && <span className="trial-left">{left}</span>}
        <a className="trial-cta" href={`https://wa.me/${DEVELOPER.whatsapp}?text=${msg}`} target="_blank" rel="noopener noreferrer">{en ? "Activate my site" : "فعّل موقعك"}</a>
      </div>
      <div className="trial-watermark" aria-hidden="true" />
    </>
  );
}
