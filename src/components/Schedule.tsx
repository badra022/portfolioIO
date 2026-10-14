"use client";
import { useMemo, useState } from "react";
import type { Content } from "@/lib/schema";
import { chatUrl, fill, type ChatConfig } from "@/lib/chat";
import { formatTime } from "@/lib/format";
import { Icon } from "./Icon";
import { ChatButton } from "./ChatButton";
import { Rich } from "./Rich";
import { Carousel } from "./Carousel";

/** Ready-made texts when the teacher leaves them empty. */
const STATUS_TEXT = { available: "فيه أماكن", full: "كامل العدد", notStarted: "لسه مبدأتش" } as const;
const WAITLIST_LABEL = "سجّلني في قائمة الانتظار";
const RESERVE_LABEL = "احجز مكانك من دلوقتي";
const WAITLIST_MSG = "السلام عليكم، مجموعة {grade} ({subject}) {days} {time} كاملة. ممكن تسجلني في قائمة الانتظار لو فضي مكان؟";
const RESERVE_MSG = "السلام عليكم، عايز أحجز مكان في مجموعة {grade} ({subject}) اللي هتبدأ {start}. ممكن التفاصيل؟";

/** "السبت 10 أكتوبر", in Cairo time so the server and the phone agree. */
function startDay(iso: string, locale: string) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Cairo" }).format(d);
}

type Props = {
  data: NonNullable<Content["schedule"]>;
  stages: { id: string; name: string }[];
  dayLabels: Record<string, string>;
  joiner: string;
  locale: string;
  chat: ChatConfig;
};

export function Schedule({ data, stages, dayLabels, joiner, locale, chat }: Props) {
  const [stage, setStage] = useState("all");
  const [day, setDay] = useState("all");
  const [area, setArea] = useState("all");
  const L = data.labels;

  const usedDays = useMemo(() => {
    const order = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];
    const set = new Set(data.slots.flatMap((s) => s.days));
    return order.filter((d) => set.has(d as never));
  }, [data.slots]);

  const areas = useMemo(() => [...new Set(data.slots.map((s) => s.area?.trim()).filter((a): a is string => !!a))], [data.slots]);
  /** The section-wide location only makes sense when no group names its own center. */
  const perGroupPlaces = data.slots.some((s) => s.area || s.center);

  const visible = data.slots.filter((s) =>
    (stage === "all" || s.stage === stage) &&
    (day === "all" || s.days.length === 0 || s.days.includes(day as never)) &&
    (area === "all" || s.area?.trim() === area),
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
          {data.filters.area && areas.length > 1 && (
            <div className="fgroup" role="group" aria-label={L.area ?? ""}>
              {L.area && <span>{L.area}</span>}
              {["all", ...areas].map((a) => (
                <button key={a} type="button" className="chip" aria-pressed={area === a} onClick={() => setArea(a)}>{a === "all" ? L.all : a}</button>
              ))}
            </div>
          )}
          {!perGroupPlaces && <span className="place"><Icon name="pin" />{data.location}</span>}
        </div>

        {/* Four groups or more swipe (with arrows and dots) instead of filling the page; fewer stay as cards. */}
        <Carousel key={`${stage}|${day}|${area}`} display={visible.length >= 4 ? "carousel" : "grid"} className="sched" label={data.eyebrow}>
          {visible.map((s) => {
            const t = s.time ? formatTime(s.time, L.am, L.pm) : null;
            const days = s.days.map((d) => dayLabels[d]).join(joiner);
            const center = s.center?.trim() || data.location;
            const place = [s.area?.trim(), center].filter(Boolean).join(" - ");
            const vars = { grade: s.grade, subject: s.subject, days, time: t ? `${t.clock} ${t.period}` : "", location: center, area: s.area?.trim() ?? "" };
            const status = s.status;
            const statusText = status ? (L[status]?.trim() || STATUS_TEXT[status]) : null;
            const start = status === "notStarted" && s.startsOn ? startDay(s.startsOn, locale) : "";
            // Full: the button joins the waiting list. Not started: it books a place early.
            const kind = status === "full" ? "waitlist" : status === "notStarted" ? "reserve" : t ? "book" : "ask";
            const label = kind === "waitlist" ? L.waitlist?.trim() || WAITLIST_LABEL : kind === "reserve" ? L.reserve?.trim() || RESERVE_LABEL : kind === "book" ? L.book : L.ask;
            const template = kind === "waitlist" ? data.messages.waitlist?.trim() || WAITLIST_MSG : kind === "reserve" ? data.messages.reserve?.trim() || RESERVE_MSG : data.messages[kind];
            const msg = fill(template, { ...vars, start: start || "قريب" }).replace(/ {2,}/g, " ");
            const strong = kind === "book" || kind === "reserve";
            return (
              <article className={`slot${t ? "" : " tbd"}${status ? ` st-${status}` : ""}`} key={s.id}>
                <div className="slot-top">
                  <div><h3>{s.grade}</h3><span className="subj">{s.subject}</span></div>
                  {s.mode && <span className="mode">{s.mode}</span>}
                </div>
                {statusText && (
                  <span className={`slot-status is-${status}`}>
                    <i aria-hidden="true" />{statusText}
                    {start && <small>· {L.startsOn?.trim() || "تبدأ"} {start}</small>}
                  </span>
                )}
                <div className="when">
                  {t ? <span className="time num">{t.clock}<small>{t.period}</small></span> : <span className="time">{L.tbd}</span>}
                  {s.days.length > 0 && <div className="days">{s.days.map((d) => <span className="day" key={d}>{dayLabels[d]}</span>)}</div>}
                </div>
                {perGroupPlaces && <span className="slot-place"><Icon name="pin" />{place}</span>}
                {data.form ? (
                  <ChatButton chat={chat} block variant={strong ? "primary" : "ghost"} label={label} message="" refCode={`SCH-${s.id}`} form={data.form}
                    context={{
                      "المجموعة": `${s.grade} — ${s.subject}`, ...(days ? { "الأيام": days } : {}), ...(t ? { "الساعة": `${t.clock} ${t.period}` } : {}), "المكان": place || center,
                      ...(statusText ? { "حالة المجموعة": start ? `${statusText} (تبدأ ${start})` : statusText } : {}),
                      ...(kind === "waitlist" ? { "الطلب": "قائمة الانتظار" } : {}),
                    }} />
                ) : (
                  <a className={`btn btn-block ${strong ? "btn-wa" : "btn-ghost"}`} href={chatUrl(chat, msg, `SCH-${s.id}`)} target="_blank" rel="noopener noreferrer">
                    <Icon name={chat.primary} />{label}
                  </a>
                )}
              </article>
            );
          })}
        </Carousel>
        {visible.length === 0 && <p className="empty">{L.empty}</p>}
      </div>
    </section>
  );
}
