"use client";
import { useState } from "react";
import { Lightbox, type Photo } from "./Lightbox";

/**
 * An honor-board entry's photos: one photo fills the space; several make a grid
 * (at most four tiles, the last one "+3" when there are more). Tapping opens them
 * all full size. Without JavaScript each tile links to its full image.
 */
export function HonorPhotos({ photos }: { photos: Photo[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const tiles = photos.slice(0, 4);
  const more = photos.length - tiles.length;
  return (
    <>
      <div className={`hb-photos n-${tiles.length}`}>
        {tiles.map((p, i) => (
          <a
            key={p.src + i}
            href={p.src}
            target="_blank"
            rel="noopener"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) return;
              e.preventDefault();
              setOpen(i);
            }}
          >
            <img src={p.src} alt={p.alt} loading="lazy" />
            {more > 0 && i === tiles.length - 1 && <span className="hb-more num" dir="ltr">+{more}</span>}
          </a>
        ))}
      </div>
      {open !== null && <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
