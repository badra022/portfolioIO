"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MenuItem } from "@/lib/sections-meta";
import { Icon } from "./Icon";

/** Opens the full-screen sections menu (phones). */
export const OPEN_MENU = "sections-menu";

/**
 * Every section of the page in one place: a sidebar on computers (a slim rail of
 * icons on tablets), and on phones a full-screen menu opened from the top bar.
 * The section being read is highlighted as the visitor scrolls.
 */
export function SectionMenu({ items, title, name, avatar, cta }: {
  items: MenuItem[];
  title: string;
  name: string;
  avatar?: string;
  cta: React.ReactNode;
}) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const [open, setOpen] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const targets = items.map((it) => document.getElementById(it.id)).filter((el): el is HTMLElement => el !== null);
    if (!targets.length) return;
    // A section counts as "being read" when it crosses the upper third of the screen.
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive(hit.target.id);
    }, { rootMargin: "-30% 0px -65% 0px" });
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [items]);

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_MENU, show);
    return () => window.removeEventListener(OPEN_MENU, show);
  }, []);
  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus({ preventScroll: true });
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => { root.style.overflow = before; window.removeEventListener("keydown", onKey); };
  }, [open, close]);

  const link = (it: MenuItem, cls: string) => (
    <a key={it.id} className={cls} href={`#${it.id}`} aria-current={active === it.id ? "true" : undefined} onClick={close}>
      <span className="side-ico"><Icon name={it.icon} /></span>
      <span className="side-lbl">{it.label}</span>
    </a>
  );

  return (
    <>
      <aside className="side" aria-label={title}>
        <a className="side-who" href="#top">
          {avatar ? <img src={avatar} alt="" width={44} height={44} /> : <span className="side-mono">{name.trim().slice(0, 1)}</span>}
          <b>{name}</b>
        </a>
        <p className="side-title">{title}</p>
        <nav className="side-nav">{items.map((it) => link(it, "side-link"))}</nav>
        <div className="side-cta">{cta}</div>
      </aside>
      {open && (
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
          <div className="sheet-head">
            <span id="sheet-title">{title}</span>
            <button ref={closeBtn} type="button" className="sheet-close" aria-label="إغلاق" onClick={close}><Icon name="close" /></button>
          </div>
          <nav className="sheet-grid">{items.map((it) => link(it, "sheet-tile"))}</nav>
          <div className="sheet-cta" onClick={close}>{cta}</div>
        </div>
      )}
    </>
  );
}

/** The top bar's button that opens the menu on phones. */
export function MenuButton({ label }: { label: string }) {
  return (
    <button type="button" className="nav-menu" onClick={() => window.dispatchEvent(new Event(OPEN_MENU))}>
      <Icon name="menu" /><span>{label}</span>
    </button>
  );
}
