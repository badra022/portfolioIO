"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MenuItem } from "@/lib/sections-meta";
import { Icon } from "./Icon";

/** Opens or closes the sections menu (the header's menu button). */
const TOGGLE = "sections-menu";
/** Tells the header button whether the menu is open (for screen readers). */
const STATE = "sections-menu-state";
const DOCKED = "(min-width: 1100px)";
const KEY = "side:closed";

/**
 * Every section of the page in one list. On computers it's docked at the side and
 * open by default; on tablets and phones it slides over the page. The header's
 * menu button opens and closes it everywhere (a closed docked menu is remembered
 * on the device). The section being read is highlighted as the visitor scrolls.
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
  const [docked, setDocked] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const panel = useRef<HTMLElement>(null);

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

  // Docked (computer) or sliding (tablet/phone), and the remembered "closed" on computers.
  useEffect(() => {
    const mq = matchMedia(DOCKED);
    const sync = () => { setDocked(mq.matches); setOpen(false); };
    sync();
    try { setCollapsed(localStorage.getItem(KEY) === "1"); } catch { /* storage blocked */ }
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (collapsed) document.documentElement.dataset.side = "closed";
    else delete document.documentElement.dataset.side;
  }, [collapsed]);

  const shown = docked ? !collapsed : open;
  useEffect(() => { window.dispatchEvent(new CustomEvent(STATE, { detail: shown })); }, [shown]);

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const toggle = () => {
      if (matchMedia(DOCKED).matches) {
        setCollapsed((c) => {
          try { localStorage.setItem(KEY, c ? "0" : "1"); } catch { /* storage blocked */ }
          return !c;
        });
      } else setOpen((o) => !o);
    };
    window.addEventListener(TOGGLE, toggle);
    return () => window.removeEventListener(TOGGLE, toggle);
  }, []);

  // Sliding menu: keep the page still behind it, Escape closes, focus moves in.
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => { root.style.overflow = before; window.removeEventListener("keydown", onKey); };
  }, [open, close]);

  return (
    <>
      <aside ref={panel} id="side-menu" className={`side${open ? " open" : ""}`} aria-label={title} inert={!shown}>
        <div className="side-head">
          <a className="side-who" href="#top" onClick={close}>
            {avatar ? <img src={avatar} alt="" width={40} height={40} /> : <span className="side-mono">{name.trim().slice(0, 1)}</span>}
            <b>{name}</b>
          </a>
          <button type="button" className="side-close" aria-label="إغلاق القائمة" onClick={() => window.dispatchEvent(new Event(TOGGLE))}><Icon name="close" /></button>
        </div>
        <p className="side-title">{title}</p>
        <nav className="side-nav">
          {items.map((it) => (
            <a key={it.id} className="side-link" href={`#${it.id}`} aria-current={active === it.id ? "true" : undefined} onClick={close}>
              <span className="side-ico"><Icon name={it.icon} /></span>
              <span className="side-lbl">{it.label}</span>
            </a>
          ))}
        </nav>
        <div className="side-cta" onClick={close}>{cta}</div>
      </aside>
      {open && <div className="side-backdrop" onClick={close} aria-hidden="true" />}
    </>
  );
}

/** The header's button that opens and closes the sections menu, on every screen. */
export function MenuButton({ label }: { label: string }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setExpanded(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(STATE, on);
    return () => window.removeEventListener(STATE, on);
  }, []);
  return (
    <button type="button" className="nav-menu" aria-label={label} aria-controls="side-menu" aria-expanded={expanded} onClick={() => window.dispatchEvent(new Event(TOGGLE))}>
      <Icon name="menu" />
    </button>
  );
}
