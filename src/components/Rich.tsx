import type { RichTextT } from "@/lib/schema";

/** Renders text runs; `accent` uses the brand color, `tag` the boxed highlight. */
export function Rich({ value }: { value: RichTextT }) {
  return (
    <>
      {value.map((s, i) => {
        if (s.style === "accent") return <span key={i} className="hl">{s.text}</span>;
        if (s.style === "tag") return <span key={i} className="tag">{s.text}</span>;
        if (s.style === "strong") return <b key={i}>{s.text}</b>;
        return <span key={i}>{s.text}</span>;
      })}
    </>
  );
}
