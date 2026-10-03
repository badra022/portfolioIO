"use client";
import { useMemo, useState } from "react";
import type { Content } from "@/lib/schema";
import { chatUrl, fill, type ChatConfig } from "@/lib/chat";
import { formatTime } from "@/lib/format";
import { Icon } from "./Icon";
import { Rich } from "./Rich";

type Props = {
  data: NonNullable<Content["schedule"]>;
  stages: { id: string; name: string }[];
  dayLabels: Record<string, string>;
  joiner: string;
  chat: ChatConfig;
};

export function Schedule({ data, stages, dayLabels, joiner, chat }: Props) {
  const [stage, setStage] = useState("all");
  const [day, setDay] = useState("all");
  const L = data.labels;

  const usedDays = useMemo(() => {
    const order = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];
    const set = new Set(data.slots.flatMap((s) => s.days));
    return order.filter((d) => set.has(d as never));
  }, [data.slots]);

  const visible = data.slots.filter((s) =>
    (stage === "all" || s.stage === stage) &&
    (day === "all" || s.days.length === 0 || s.days.includes(day as never)),
  );

  return (
    <section className="block" id="schedule">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">{data.eyebrow}</span>
          <h2><Rich value={data.title} /></h2>
          {data.intro && <p>{data.intro}</p>}
        </div>

        <div className="filters">
          {data.filters.stage && stages.length > 1 && (
            <div className="fgroup" role="group" aria-label={L.stage}>
              <span>{L.stage}</span>
              {[{ id: "all", name: L.all }, ...stages].map((s) => (
                <button key={s.id} type="button" className="chip" aria-pressed={stage === s.id} onClick={() => setStage(s.id)}>{s.name}</button>
              ))}
            </div>
          )}
          {data.filters.day && usedDays.length > 1 && (
            <div className="fgroup" role="group" aria-label={L.day}>
              <span>{L.day}</span>
              {["all", ...usedDays].map((d) => (
                <button key={d} type="button" className="chip" aria-pressed={day === d} onClick={() => setDay(d)}>{d === "all" ? L.all : dayLabels[d]}</button>
              ))}
            </div>
          )}
          <span className="place"><Icon name="pin" />{data.location}</span>
        </div>

        <div className="sched">
          {visible.map((s) => {
            const t = s.time ? formatTime(s.time, L.am, L.pm) : null;
            const days = s.days.map((d) => dayLabels[d]).join(joiner);
            const vars = { grade: s.grade, subject: s.subject, days, time: t ? `${t.clock} ${t.period}` : "", location: data.location };
            const msg = fill(t ? data.messages.book : data.messages.ask, vars);
            return (
              <article className={`slot${t ? "" : " tbd"}`} key={s.id}>
                <div className="slot-top">
                  <div><h3>{s.grade}</h3><span className="subj">{s.subject}</span></div>
                  {s.mode && <span className="mode">{s.mode}</span>}
                </div>
                <div className="when">
                  {t ? <span className="time num">{t.clock}<small>{t.period}</small></span> : <span className="time">{L.tbd}</span>}
                  {s.days.length > 0 && <div className="days">{s.days.map((d) => <span className="day" key={d}>{dayLabels[d]}</span>)}</div>}
                </div>
                <a className={`btn btn-block ${t ? "btn-wa" : "btn-ghost"}`} href={chatUrl(chat, msg, `SCH-${s.id}`)} target="_blank" rel="noopener noreferrer">
                  <Icon name={chat.primary} />{t ? L.book : L.ask}
                </a>
              </article>
            );
          })}
          {visible.length === 0 && <p className="empty">{L.empty}</p>}
        </div>
      </div>
    </section>
  );
}
