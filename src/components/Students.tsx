import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { asset } from "@/lib/assets";
import { ChatButton } from "./ChatButton";
import { Rich } from "./Rich";

export function Students({ data, chat }: { data: NonNullable<Content["students"]>; chat: ChatConfig }) {
  return (
    <section className="block" id="students">
      <div className={`wrap students${data.photo ? "" : " no-photo"}`}>
        <div className="sec-head flush">
          <span className="eyebrow">{data.eyebrow}</span>
          <div className="big num">{data.prefix && <i>{data.prefix}</i>}{data.count}</div>
          <h2><Rich value={data.title} /></h2>
          <p>{data.text}</p>
          <div className="cta-row">
            <ChatButton chat={chat} label={data.cta.label} message={data.cta.message} refCode={data.cta.ref} />
          </div>
        </div>
        {data.photo && <img className="students-photo" src={asset(data.photo)} alt="" loading="lazy" />}
      </div>
    </section>
  );
}
