import type { RichTextT } from "@/lib/schema";
import { Rich } from "./Rich";

export function SectionHead({ eyebrow, title, intro, flush }: { eyebrow: string; title: RichTextT; intro?: string; flush?: boolean }) {
  return (
    <div className={`sec-head${flush ? " flush" : ""}`}>
      <span className="eyebrow">{eyebrow}</span>
      <h2><Rich value={title} /></h2>
      {intro && <p>{intro}</p>}
    </div>
  );
}
