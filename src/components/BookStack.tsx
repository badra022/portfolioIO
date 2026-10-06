"use client";
import { useEffect, useRef, useState } from "react";
import { Lightbox, type Photo } from "./Lightbox";

/** How many inside pages peek out from behind the cover (the viewer shows all of them). */
const VISIBLE_PAGES = 3;

/**
 * The book as a physical object: the cover in front, inside pages stacked behind it.
 * Hover (desktop) fans the pages out a little; a tap fans them out further; tapping
 * a page (or the cover) while open shows it full size, with previous/next through
 * the cover and every page.
 */
export function BookStack({ cover, coverAlt, pages, caption, closeLabel }: {
  cover: string;
  coverAlt: string;
  pages: Photo[];
  caption?: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const all: Photo[] = [{ src: cover, alt: coverAlt }, ...pages];
  const shown = pages.slice(0, VISIBLE_PAGES);

  // Tapping anywhere else closes the fan.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (view === null && root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, view]);

  const tap = (i: number) => (open ? setView(i) : setOpen(true));

  return (
    <div className="bookstack-stage" ref={root}>
      <div className={`bookstack${open ? " open" : ""}`}>
        {/* Deepest page first so later ones paint on top. */}
        {shown.map((p, i) => ({ p, i })).reverse().map(({ p, i }) => (
          <button
            key={p.src}
            type="button"
            className="sheet page"
            style={{ "--i": i + 1 } as React.CSSProperties}
            aria-label={p.alt}
            onClick={() => tap(i + 1)}
            tabIndex={open ? 0 : -1}
          >
            <img src={p.src} alt="" loading="lazy" draggable={false} />
          </button>
        ))}
        <button type="button" className="sheet cover" aria-label={coverAlt} aria-expanded={open} onClick={() => tap(0)}>
          <img src={cover} alt={coverAlt} width={520} height={735} draggable={false} />
          <span className="spine" aria-hidden="true" />
        </button>
      </div>
      {caption && <p className="bookstack-cap">{caption}</p>}
      {view !== null && (
        <Lightbox photos={all} index={view} onIndex={setView} onClose={() => setView(null)} closeLabel={closeLabel} />
      )}
    </div>
  );
}
