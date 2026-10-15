"use client";
import { Children, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useUI } from "./UIText";

export type DisplayT = "auto" | "carousel" | "grid" | "list";

/**
 * A section's list of cards in the layout the teacher chose:
 * - carousel: one row that swipes (arrows and dots too), everywhere;
 * - auto: swipes on phones; on bigger screens the section's usual grid, or swipes
 *   too when there are more cards than fit in one row;
 * - grid / list: the usual grid, or one card under the other.
 * `className` is the section's own grid (e.g. "exams count-3"), used whenever it isn't swiping.
 * `per` = cards visible at once on a computer in carousel mode.
 */
export function Carousel({ display, className, per = 3, label, children }: {
  display: DisplayT;
  className: string;
  per?: number;
  label: string;
  children: React.ReactNode;
}) {
  const t = useUI();
  const items = Children.toArray(children);
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [ends, setEnds] = useState({ start: true, end: false });
  // auto swipes on every screen when there are more cards than fit in one row (else only on phones).
  const mode = display === "auto" && items.length > per ? "carousel" : display;
  const swipes = mode === "carousel" || mode === "auto";

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    // scrollLeft runs negative in right-to-left pages.
    const pos = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    setEnds({ start: pos < 8, end: pos > max - 8 });
    const slides = Array.from(el.children) as HTMLElement[];
    const w = slides[0]?.offsetWidth || 1;
    const gap = slides[1] ? Math.abs(slides[1].offsetLeft - slides[0].offsetLeft) - w : 0;
    setAt(Math.min(slides.length - 1, Math.round(pos / (w + gap))));
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el || !swipes) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", measure); ro.disconnect(); };
  }, [measure, swipes]);

  const go = (i: number) => {
    const slide = track.current?.children[Math.max(0, Math.min(items.length - 1, i))] as HTMLElement | undefined;
    // "start" is the right edge on right-to-left pages; "nearest" keeps the page where it is.
    slide?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };

  if (!swipes || items.length < 2) {
    return <div className={`${className}${display === "list" ? " iv-list" : ""}`}>{children}</div>;
  }

  return (
    <div className={`car car-${mode}`} style={{ ["--per" as string]: per }} role="region" aria-roledescription="carousel" aria-label={label}>
      <div ref={track} className={`car-track ${className}`}>
        {items.map((child, i) => (
          <div className="car-slide" key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${items.length}`}>{child}</div>
        ))}
      </div>
      <div className="car-ctrl" hidden={ends.start && ends.end}>
        <button type="button" className="car-btn prev" aria-label={t.prev} disabled={ends.start} onClick={() => go(at - 1)}><Icon name="arrow" /></button>
        <div className="car-dots">
          {items.map((_, i) => (
            <button key={i} type="button" aria-label={`${i + 1}`} aria-current={i === at ? "true" : undefined} onClick={() => go(i)} />
          ))}
        </div>
        <button type="button" className="car-btn next" aria-label={t.next} disabled={ends.end} onClick={() => go(at + 1)}><Icon name="arrow" /></button>
      </div>
    </div>
  );
}
