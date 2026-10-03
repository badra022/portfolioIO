"use client";
import { useEffect, useState } from "react";
import type { Content } from "@/lib/schema";
import { chatUrl, fill, type ChatConfig } from "@/lib/chat";
import { parseDate } from "@/lib/format";
import { Icon } from "./Icon";

type Data = NonNullable<Content["exams"]>;
type Exam = Data["items"][number];
type Parts = { day: string; month: string; weekday: string; short: string };

function useCountdown(iso: string) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const target = parseDate(iso);
    // Date-only exams count down to the start of that day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) target.setHours(0, 0, 0, 0);
    const tick = () => setLeft(target.getTime() - Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [iso]);
  return left;
}

export function ExamCard({ exam, parts, labels, chat }: { exam: Exam; parts: Parts; labels: Data["labels"]; chat: ChatConfig }) {
  const [track, setTrack] = useState(exam.tracks[0].id);
  const t = exam.tracks.find((x) => x.id === track) ?? exam.tracks[0];
  const left = useCountdown(exam.date);
  const href = chatUrl(chat, fill(exam.message, { date: parts.short, track: t.label, scope: t.scope }), `EXAM-${exam.id}`);

  let countdown: string | null = null;
  if (left !== null) {
    if (left <= 0) countdown = labels.today;
    else {
      const d = Math.floor(left / 86_400_000);
      const h = Math.floor((left % 86_400_000) / 3_600_000);
      const m = Math.floor((left % 3_600_000) / 60_000);
      countdown = d > 0 ? `${labels.countdown} ${d} ${labels.days} و ${h} ${labels.hours}` : `${labels.countdown} ${h} ${labels.hours} و ${m} ${labels.minutes}`;
    }
  }

  return (
    <article className={`exam${exam.featured ? " featured" : ""}`}>
      <div className="date">
        <div className="mo">{parts.month}</div>
        <div className="d num">{parts.day}</div>
        <div className="wd">{parts.weekday}</div>
      </div>
      <div className="exam-body">
        <div className="exam-top">
          <h3>{exam.title}</h3>
          {countdown && <span className="countdown num">{countdown}</span>}
        </div>
        {(exam.place || exam.fee) && (
          <div className="facts">
            {exam.place && <span><Icon name="pin" /><b>{exam.place}</b></span>}
            {exam.fee && <span><b>{exam.fee}</b></span>}
          </div>
        )}
        {exam.prize && <div className="prize"><Icon name="trophy" /><span><small>{labels.prize}</small>{exam.prize}</span></div>}
        <div className="tracks" role="radiogroup" aria-label={labels.trackLabel}>
          <span className="lbl">{labels.trackLabel}</span>
          {exam.tracks.map((tr) => (
            <label className={`track${track === tr.id ? " on" : ""}`} key={tr.id}>
              <input type="radio" name={`exam-${exam.id}`} id={`exam-${exam.id}-${tr.id}`} checked={track === tr.id} onChange={() => setTrack(tr.id)} />
              <b>{tr.label}</b>
              <span>{labels.scope} {tr.scope}</span>
            </label>
          ))}
        </div>
        <a className="btn btn-wa btn-block" href={href} target="_blank" rel="noopener noreferrer"><Icon name={chat.primary} />{exam.cta}</a>
      </div>
    </article>
  );
}
