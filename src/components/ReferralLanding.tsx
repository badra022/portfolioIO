"use client";
import { useEffect } from "react";
import { REF_PARAM, firstRefVisit, rememberRef } from "@/lib/referral";
import { IGNORE_KEY } from "./Tracker";

/**
 * Every page of a site with referral partners (content.referrals): when the link
 * carries ?ref=<code> of a known partner, remembers it on the device and counts
 * the visit for that partner (api/v). The teacher's own browser isn't counted.
 */
/** One count per page load, even if the effect runs twice (React dev mode). */
let counted = false;

export function ReferralLanding({ slug, base, codes, preview = false }: { slug: string; base: string; codes: string[]; preview?: boolean }) {
  useEffect(() => {
    const code = new URLSearchParams(location.search).get(REF_PARAM)?.trim().toLowerCase();
    if (!code || !codes.includes(code)) return;
    rememberRef(slug, code);
    if (counted) return;
    counted = true;
    try { if (!preview && localStorage.getItem(IGNORE_KEY) === "1") return; } catch { /* storage blocked */ }
    if (navigator.webdriver) return;
    const page = location.pathname.slice(base.length).replace(/^\/+|\/+$/g, "").split("/")[0] || "home";
    const body = JSON.stringify({ e: [{ t: "ref", c: code, pg: page, u: firstRefVisit(slug, code, page) }] });
    if (!navigator.sendBeacon?.(`${base}/api/v`, new Blob([body], { type: "text/plain" }))) {
      fetch(`${base}/api/v`, { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
    }
  }, [slug, base, codes, preview]);
  return null;
}
