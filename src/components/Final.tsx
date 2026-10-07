import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { ChatButton } from "./ChatButton";
import { Rich } from "./Rich";

export function Phone({ number, highlight }: { number: string; highlight?: number[] }) {
  return (
    <span className="phone num" dir="ltr">
      {number.split("").map((ch, i) => (highlight?.includes(i) ? <i key={i}>{ch}</i> : <span key={i}>{ch}</span>))}
    </span>
  );
}

export function Final({ c, chat }: { c: Content; chat: ChatConfig }) {
  const f = c.final!;
  return (
    <section className="final">
      <div className="wrap">
        <h2><Rich value={f.title} /></h2>
        <p>{f.text}</p>
        <div className="cta-row center">
          <ChatButton chat={chat} label={f.cta.label} message={f.cta.message} refCode={f.cta.ref} form={f.cta.form} />
        </div>
        {c.contact.phones.length > 0 && (
          <div className="phones">
            {c.contact.phones.map((p) => <Phone key={p} number={p} highlight={c.contact.phoneHighlights?.[p]} />)}
          </div>
        )}
      </div>
    </section>
  );
}
