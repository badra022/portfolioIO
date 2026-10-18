"use client";
import { useEffect } from "react";
import { IGNORE_KEY } from "./Tracker";

/** One visit per page load of a teacher's page (offers, requests), counted per address (lib/server/analytics.ts page_view). */
export function PageVisit({ base, path }: { base: string; path: string }) {
  useEffect(() => {
    try { if (localStorage.getItem(IGNORE_KEY) === "1") return; } catch { /* storage blocked */ }
    if (navigator.webdriver) return;
    const body = JSON.stringify({ e: [{ t: "page", p: path }] });
    const url = `${base}/api/v`;
    if (!navigator.sendBeacon?.(url, body)) void fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
  }, [base, path]);
  return null;
}
