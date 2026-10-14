"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Long text folded after a few lines, with "read more" / "show less". Short text
 * shows whole (the button only appears when something is cut off).
 */
export function ReadMore({ text, className, more = "اقرأ المزيد", less = "عرض أقل" }: { text: string; className: string; more?: string; less?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { if (!el.classList.contains("open")) setCut(el.scrollHeight > el.clientHeight + 2); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <p ref={ref} className={`${className} folded${open ? " open" : ""}`}>{text}</p>
      {(cut || open) && (
        <button type="button" className="read-more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? less : more}</button>
      )}
    </>
  );
}
