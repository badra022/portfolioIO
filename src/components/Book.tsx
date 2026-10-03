import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { asset } from "@/lib/assets";
import { BookOrder } from "./BookOrder";
import { SectionHead } from "./SectionHead";

export function Book({ data, chat }: { data: NonNullable<Content["book"]>; chat: ChatConfig }) {
  return (
    <section className="block" id="book">
      <div className="wrap book">
        <div className="cover-stage">
          <img className="cover" src={asset(data.cover)} alt={data.coverAlt} loading="lazy" width={520} height={735} />
        </div>
        <div className="book-copy">
          <SectionHead eyebrow={data.eyebrow} title={data.title} intro={data.intro} flush />
          <div className="feats">
            {data.features.map((f) => (
              <div className="feat" key={f.label}><b className="num">{f.value}</b><span>{f.label}</span></div>
            ))}
          </div>
          <BookOrder order={data.order} chat={chat} />
        </div>
      </div>
    </section>
  );
}
