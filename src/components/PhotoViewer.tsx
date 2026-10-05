"use client";
import { useRef, useState } from "react";

export type Photo = { src: string; alt: string; caption?: string };

/**
 * A row of photos that open full size in a dialog. Without JavaScript each
 * photo is a plain link to the full image.
 */
export function PhotoViewer({ photos, className, closeLabel }: { photos: Photo[]; className: string; closeLabel: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<Photo | null>(null);

  return (
    <>
      <div className={className}>
        {photos.map((p) => (
          <figure key={p.src}>
            <a
              href={p.src}
              target="_blank"
              rel="noopener"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || !dialog.current) return;
                e.preventDefault();
                setOpen(p);
                dialog.current.showModal();
              }}
            >
              <img src={p.src} alt={p.alt} loading="lazy" />
            </a>
            {p.caption && <figcaption>{p.caption}</figcaption>}
          </figure>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="viewer"
        onClose={() => setOpen(null)}
        onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "IMG") dialog.current?.close(); }}
      >
        <button type="button" className="viewer-close" aria-label={closeLabel} onClick={() => dialog.current?.close()}>×</button>
        {open && (
          <figure>
            <img src={open.src} alt={open.alt} />
            {open.caption && <figcaption>{open.caption}</figcaption>}
          </figure>
        )}
      </dialog>
    </>
  );
}
