import type { Content } from "@/lib/schema";
import { Icon } from "./Icon";
import { SectionHead } from "./SectionHead";
import { Carousel } from "./Carousel";

export function Method({ data }: { data: NonNullable<Content["method"]> }) {
  return (
    <section className="block" id="method">
      <div className="wrap">
        <SectionHead eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
        <Carousel display={data.display} className="method" label={data.eyebrow}>
          {data.items.map((m) => (
            <div className="m" key={m.title}>
              <span className="ico"><Icon name={m.icon} /></span>
              <h3>{m.title}</h3>
              <p>{m.text}</p>
            </div>
          ))}
        </Carousel>
      </div>
    </section>
  );
}
