import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { ActionButton } from "./ActionButton";
import { SectionHead } from "./SectionHead";

/** Frequently asked questions: one answer open at a time, no script needed. */
export function Faq({ data, chat }: { data: NonNullable<Content["faq"]>; chat: ChatConfig }) {
  const items = data.items.filter((q) => q.question.trim() && q.answer.trim());
  if (!items.length) return null;
  return (
    <section className="block" id="faq">
      <div className="wrap faq-wrap">
        <SectionHead eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
        <div className="faq-list">
          {items.map((q, i) => (
            // Same name = opening one closes the others (where the browser supports it).
            <details className="faq-item" name="faq" key={i} open={data.openFirst && i === 0}>
              <summary><span>{q.question}</span><i aria-hidden="true" /></summary>
              <p>{q.answer}</p>
            </details>
          ))}
        </div>
        {(data.moreText || data.cta) && (
          <div className="faq-more">
            {data.moreText && <p>{data.moreText}</p>}
            {data.cta && <ActionButton action={data.cta} chat={chat} />}
          </div>
        )}
      </div>
    </section>
  );
}
