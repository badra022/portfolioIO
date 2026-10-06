import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { asset } from "@/lib/assets";
import { ActionButton } from "./ActionButton";
import { SectionHead } from "./SectionHead";
import { Socials } from "./Socials";

/** "Other services": cards with an image, text, a button to any channel, and optional social links. */
export function Services({ data, chat }: { data: NonNullable<Content["services"]>; chat: ChatConfig }) {
  if (!data.items.length) return null;
  return (
    <section className="block" id="services">
      <div className="wrap">
        <SectionHead eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
        <div className={`svc-grid${data.items.length === 1 ? " single" : ""}`}>
          {data.items.map((s, i) => (
            <article className="svc" key={s.title + i}>
              {s.image && <img className="svc-img" src={asset(s.image)} alt="" loading="lazy" />}
              <div className="svc-body">
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                {s.cta && <ActionButton action={s.cta} chat={chat} />}
                {s.socials.length > 0 && <Socials items={s.socials} />}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
