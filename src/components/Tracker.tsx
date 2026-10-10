"use client";
import { useEffect } from "react";
import {
  CONVERT_EVENT, MAX_DWELL, cairoDay, channelOf, groupsOf, sourceOf,
  type GroupT, type PeriodT, type TrackEvent,
} from "@/lib/analytics";
import { placeOf } from "@/lib/place";

/**
 * "1": this browser opened /admin on this site, so its visits aren't counted.
 * "count": its owner chose to be counted anyway (from the dashboard); /admin leaves it alone.
 */
export const IGNORE_KEY = "pa:ignore";

/** One view per page load, even if the effect runs twice (React dev mode). */
let viewSent = false;

type Stamp = Partial<Record<PeriodT, string>>;
type Memory = { v?: Stamp; c?: Partial<Record<GroupT, Stamp>> };

/**
 * Which periods (day / month / ever) this is the first time for, updating the stamp.
 * Stamps hold the Cairo day and month of the last time, never anything personal.
 */
function firsts(stamp: Stamp, day: string): PeriodT[] {
  const month = day.slice(0, 7);
  const out: PeriodT[] = [];
  if (stamp.d !== day) { out.push("d"); stamp.d = day; }
  if (stamp.m !== month) { out.push("m"); stamp.m = month; }
  if (!stamp.e) { out.push("e"); stamp.e = day; }
  return out;
}

function deviceOf(): string {
  const w = Math.min(window.innerWidth, screen.width || window.innerWidth);
  return w < 600 ? "phone" : w < 1024 ? "tablet" : "desktop";
}

/**
 * Counts page views, unique visitors, sections reached, button clicks (and the
 * visitors who clicked) and time on page. Sends small batches to <base>/api/v
 * with sendBeacon, so it never delays the page or a click.
 */
export function Tracker({ slug, base, preview = false }: { slug: string; base: string; preview?: boolean }) {
  useEffect(() => {
    let ignored = false;
    // The private preview is only ever opened by the people running the site, so it always counts (in its own numbers).
    try { ignored = !preview && localStorage.getItem(IGNORE_KEY) === "1"; } catch { /* storage blocked */ }
    if (ignored) {
      console.info("Analytics: this browser opened /admin on this site, so its visits are not counted. Change it from the analytics page in /admin.");
      return;
    }
    if (navigator.webdriver) return;

    // A neutral path: ad blockers' lists commonly block ".../track" and ".../analytics".
    const endpoint = `${base}/api/v`;
    const memKey = preview ? `pa:${slug}:preview` : `pa:${slug}`;
    const host = location.hostname;
    const day = cairoDay();
    let mem: Memory = {};
    try { mem = JSON.parse(localStorage.getItem(memKey) ?? "{}") ?? {}; } catch { mem = {}; }
    const save = () => { try { localStorage.setItem(memKey, JSON.stringify(mem)); } catch { /* ignore */ } };

    let queue: TrackEvent[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      clearTimeout(timer);
      if (!queue.length) return;
      const body = JSON.stringify({ e: queue });
      queue = [];
      const blob = new Blob([body], { type: "text/plain" });
      if (!navigator.sendBeacon?.(endpoint, blob)) {
        fetch(endpoint, { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
      }
    };
    const push = (e: TrackEvent, now = false) => {
      queue.push(e);
      if (now || queue.length >= 20) flush();
      else { clearTimeout(timer); timer = setTimeout(flush, 4000); }
    };

    // Page view (+ unique visitor flags).
    const params = new URLSearchParams(location.search);
    if (!viewSent) {
      viewSent = true;
      mem.v ??= {};
      push({ t: "view", dev: deviceOf(), src: sourceOf(document.referrer, params.get("utm_source"), host), u: firsts(mem.v, day) }, true);
      save();
    }

    // Sections reached: counted once per view when a good part of it is on screen.
    const seen = new Set<string>();
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const enough = en.intersectionRatio >= 0.3 || en.intersectionRect.height >= window.innerHeight * 0.3;
        const key = en.target.className.match(/\bslot-([a-z]+)/)?.[1];
        if (!enough || !key || seen.has(key)) continue;
        seen.add(key);
        io.unobserve(en.target);
        push({ t: "sec", k: key });
      }
    }, { threshold: [0, 0.3, 0.6] });
    document.querySelectorAll(".section-slot").forEach((el) => io.observe(el));

    // Clicks on any link that leaves the page (WhatsApp, YouTube, socials...).
    const onClick = (ev: MouseEvent) => {
      const a = (ev.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.closest(".devcredit")) return;
      let ch = channelOf(a.href, host);
      if (!ch) return;
      if (ch === "youtube" && a.classList.contains("thumb")) ch = "video"; // played inside the page
      const at = placeOf(a) ?? "other";
      mem.c ??= {};
      const u: Partial<Record<GroupT, PeriodT[]>> = {};
      for (const g of groupsOf(ch)) u[g] = firsts((mem.c[g] ??= {}), day);
      save();
      push({ t: "click", ch, at, u }, true);
    };
    document.addEventListener("click", onClick, true);

    // Conversions that aren't links: a form button sent (components/LeadForms.tsx).
    const onConvert = (ev: Event) => {
      const { ch, at } = (ev as CustomEvent<{ ch: string; at: string }>).detail ?? {};
      if (!ch) return;
      mem.c ??= {};
      const u: Partial<Record<GroupT, PeriodT[]>> = {};
      for (const g of groupsOf(ch)) u[g] = firsts((mem.c[g] ??= {}), day);
      save();
      push({ t: "click", ch, at: at || "other", u }, true);
    };
    window.addEventListener(CONVERT_EVENT, onConvert);

    // Time on page: only while the page is actually visible. Sent once, when the
    // visitor first leaves (switches to WhatsApp, another tab, or closes the page).
    let visibleSince = document.visibilityState === "visible" ? performance.now() : 0;
    let active = 0;
    let sent = false;
    const leave = () => {
      if (visibleSince) { active += performance.now() - visibleSince; visibleSince = 0; }
      if (!sent) {
        sent = true;
        push({ t: "dwell", s: Math.min(MAX_DWELL, Math.round(active / 1000)) });
      }
      flush();
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") leave();
      else if (!visibleSince) visibleSince = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", leave);

    return () => {
      io.disconnect();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(CONVERT_EVENT, onConvert);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", leave);
      flush();
    };
  }, [slug, base, preview]);
  return null;
}

/** Rendered on admin pages: this browser belongs to the teacher (or you), so stop counting it. */
export function IgnoreThisBrowser() {
  useEffect(() => {
    try { if (localStorage.getItem(IGNORE_KEY) !== "count") localStorage.setItem(IGNORE_KEY, "1"); } catch { /* ignore */ }
  }, []);
  return null;
}
