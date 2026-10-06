"use client";
import { useEffect, useRef, useState } from "react";
import type { Content } from "@/lib/schema";
import { Icon } from "./Icon";
import { Lightbox } from "./Lightbox";
import { Rich } from "./Rich";

type Data = NonNullable<Content["reviews"]>;

/**
 * A wall of review screenshots (masonry) under a headline number and stars.
 * Long walls are cut with a fade and a "show all" button; any review opens full size.
 */
export function Reviews({ data }: { data: Data }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [view, setView] = useState<number | null>(null);
  const wall = useRef<HTMLDivElement>(null);
  const photos = data.images.map((im, i) => ({ src: im.image, alt: im.alt ?? `${i + 1} / ${data.images.length}` }));

  useEffect(() => {
    const el = wall.current;
    if (!el || expanded) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 8);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    const imgs = Array.from(el.querySelectorAll("img"));
    imgs.forEach((i) => i.addEventListener("load", check));
    return () => { ro.disconnect(); imgs.forEach((i) => i.removeEventListener("load", check)); };
  }, [expanded, data.images.length]);

  return (
    <section className="block" id="reviews">
      <div className="wrap">
        <div className="rv-head">
          <div className="sec-head flush">
            <span className="eyebrow">{data.eyebrow}</span>
            <h2><Rich value={data.title} /></h2>
            {data.intro && <p>{data.intro}</p>}
          </div>
          {(data.metric || data.stars) && (
            <div className="rv-metric">
              {data.stars && <div className="rv-stars" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <Icon key={i} name="star" />)}</div>}
              {data.metric && <><b className="num">{data.metric.value}</b><span>{data.metric.label}</span></>}
            </div>
          )}
        </div>
        {photos.length > 0 && (
          <>
            <div ref={wall} className={`rv-wall${expanded ? " open" : ""}${overflows && !expanded ? " cut" : ""}`}>
              {photos.map((p, i) => (
                <button key={p.src + i} type="button" className="rv" onClick={() => setView(i)} aria-label={p.alt}>
                  <img src={p.src} alt={data.images[i].alt ?? ""} loading="lazy" />
                </button>
              ))}
            </div>
            {overflows && !expanded && (
              <div className="rv-more">
                <button type="button" className="btn btn-ghost" onClick={() => setExpanded(true)}>{data.moreLabel}</button>
              </div>
            )}
          </>
        )}
        {view !== null && <Lightbox photos={photos} index={view} onIndex={setView} onClose={() => setView(null)} closeLabel="إغلاق" />}
      </div>
    </section>
  );
}
