"use client";
import { useState } from "react";
import { Lightbox, type Photo } from "./Lightbox";

export type { Photo };

/**
 * A set of photos that open full size (with previous/next). Without JavaScript
 * each photo is a plain link to the full image.
 */
export function PhotoViewer({ photos, className, closeLabel }: { photos: Photo[]; className: string; closeLabel: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className={className}>
        {photos.map((p, i) => (
          <figure key={p.src}>
            <a
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
            </a>
            {p.caption && <figcaption>{p.caption}</figcaption>}
          </figure>
        ))}
      </div>
      {open !== null && <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} closeLabel={closeLabel} />}
    </>
  );
}
