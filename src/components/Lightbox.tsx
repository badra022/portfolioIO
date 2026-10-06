"use client";
import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

export type Photo = { src: string; alt: string; caption?: string };

/**
 * Full-size photo viewer with previous/next (buttons, arrow keys and swipe).
 * Rendered only while open; closing (×, Esc, tapping the backdrop) calls onClose.
 */
export function Lightbox({ photos, index, onIndex, onClose, closeLabel }: {
  photos: Photo[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  closeLabel: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const startX = useRef<number | null>(null);
  const n = photos.length;
  const go = (step: number) => onIndex((index + step + n) % n);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (n < 2 || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      const rtl = ref.current ? getComputedStyle(ref.current).direction === "rtl" : true;
      // In RTL the next photo is to the left.
      go((e.key === "ArrowLeft") === rtl ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const p = photos[index];
  return (
    <dialog
      ref={ref}
      className="viewer"
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}
      onPointerDown={(e) => { startX.current = e.clientX; }}
      onPointerUp={(e) => {
        if (startX.current === null || n < 2) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) < 50) return;
        const rtl = ref.current ? getComputedStyle(ref.current).direction === "rtl" : true;
        go((dx < 0) === rtl ? 1 : -1);
      }}
    >
      <button type="button" className="viewer-close" aria-label={closeLabel} onClick={() => ref.current?.close()}>
        <Icon name="close" />
      </button>
      {n > 1 && (
        <>
          <button type="button" className="viewer-nav prev" aria-label="السابق" onClick={() => go(-1)}><Icon name="arrow" /></button>
          <button type="button" className="viewer-nav next" aria-label="التالي" onClick={() => go(1)}><Icon name="arrow" /></button>
        </>
      )}
      <figure>
        <img src={p.src} alt={p.alt} draggable={false} />
        {(p.caption || n > 1) && (
          <figcaption>
            {p.caption}
            {n > 1 && <span className="viewer-count num">{index + 1} / {n}</span>}
          </figcaption>
        )}
      </figure>
    </dialog>
  );
}
