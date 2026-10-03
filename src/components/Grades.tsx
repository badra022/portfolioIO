import type { Content } from "@/lib/schema";
import { SectionHead } from "./SectionHead";

export function Grades({ data }: { data: NonNullable<Content["grades"]> }) {
  return (
    <section className="block" id="grades">
      <div className="wrap">
        <SectionHead eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
        <div className="stages" style={{ ["--stage-cols" as string]: data.stages.map((s) => s.items.length).join("fr ") + "fr" }}>
          {data.stages.map((st) => (
            <div className="stage" key={st.id}>
              <h3>{st.name}{st.note && <small>{st.note}</small>}</h3>
              <div className="grades">
                {st.items.map((g) => (
                  <div className="grade" key={g.name}><b>{g.name}</b><span className="subj">{g.subject}</span></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
