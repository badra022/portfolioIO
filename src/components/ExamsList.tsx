"use client";
import { useEffect, useMemo, useState } from "react";
import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import type { ExamEntry, ExamTab } from "@/lib/library";
import { groupsOf } from "@/lib/library";
import { matches } from "@/lib/search";
import { dateParts } from "@/lib/format";
import { tf } from "@/lib/i18n";
import { ExamCard } from "./ExamCard";
import { ExamResults } from "./ExamResults";
import { Icon } from "./Icon";
import { Marked, ShareButton, useCounts } from "./LibraryBits";
import { useUI } from "./UIText";

type Exam = NonNullable<Content["exams"]>["items"][number];

/**
 * The /exams page: every listed online quiz and center exam in three tabs (open now,
 * coming soon, finished), the teacher's own groups inside each tab, and a search box.
 * A quiz this device already handed in shows «اعرف درجتك»: self-graded ones reopen the
 * quiz page (which shows the result), teacher-graded ones look the grade up by name and
 * phone once the results are published (ExamResults).
 */
export function ExamsList({ entries, base, slug, locale, exams, labels, chat, nameId, phoneId, initialTab }: {
  entries: ExamEntry[];
  base: string;
  slug: string;
  locale: string;
  /** Center exams by id, for their booking cards. */
  exams: Record<string, Exam>;
  labels: NonNullable<Content["exams"]>["labels"] | null;
  chat: ChatConfig;
  nameId: string;
  phoneId: string;
  initialTab: ExamTab | null;
}) {
  const t = useUI();
  const [q, setQ] = useState("");
  const counts = useCounts(base, "kind=exams");
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (e.kind !== "quiz") continue;
      try { if (JSON.parse(localStorage.getItem(`quiz:${slug}:${e.path}`) ?? "null")?.done) set.add(e.path); } catch { /* storage blocked */ }
    }
    setDone(set);
  }, [entries, slug]);

  const titleOf = (e: ExamEntry) => (e.kind === "results" ? e.set.title : e.title);
  const groupOf = (e: ExamEntry) => (e.kind === "results" ? undefined : e.group);
  const found = useMemo(() => entries.filter((e) => matches(q, titleOf(e), groupOf(e), e.kind === "quiz" ? `${e.intro ?? ""} ${e.tags.join(" ")}` : "")), [entries, q]);
  const tabs: { id: ExamTab; label: string }[] = [
    { id: "live", label: t.libTabLive },
    { id: "soon", label: t.libTabSoon },
    { id: "closed", label: t.libTabClosed },
  ];
  const firstWith = tabs.find((x) => entries.some((e) => e.tab === x.id))?.id ?? "live";
  const [tab, setTab] = useState<ExamTab>(initialTab && entries.some((e) => e.tab === initialTab) ? initialTab : firstWith);
  const inTab = found.filter((e) => e.tab === tab).map((e) => ({ e, group: groupOf(e) }));
  const groups = groupsOf(inTab, t.libOther);
  const when = (d: string) => dateParts(d, locale).short;

  if (!entries.length) return <p className="lib-empty">{t.libEmpty}</p>;

  const card = (e: ExamEntry) => {
    if (e.kind === "offline") {
      const exam = exams[e.id];
      return exam && labels ? <div key={`o:${e.id}`} className="lib-exam-offline"><ExamCard exam={exam} parts={dateParts(exam.date, locale)} labels={labels} chat={chat} /></div> : null;
    }
    if (e.kind === "results") {
      return (
        <article key={`r:${e.set.id}`} className="lib-exam">
          <div className="lib-exam-top"><span className="lib-pill closed">{t.libResults}</span></div>
          <h3><Marked text={e.set.title} query={q} /></h3>
          <div className="lib-exam-meta"><span className="num">{when(e.set.date)}</span></div>
          <ExamResults exams={[{ id: e.set.id, title: e.set.title, date: e.set.date }]} slug={slug} base={base} locale={locale} label={t.libSeeGrade} nameId={nameId} phoneId={phoneId} direct buttonClass="btn btn-wa btn-block" />
        </article>
      );
    }
    const took = done.has(e.path);
    const status = e.tab === "live" ? (e.endsAt ? tf(t.libUntil, { date: when(e.endsAt) }) : t.libAlways)
      : e.tab === "soon" ? tf(t.libStarts, { date: e.startsAt ? when(e.startsAt) : "" })
      : e.endsAt ? tf(t.libEnded, { date: when(e.endsAt) }) : t.libTabClosed;
    const n = counts?.[e.path];
    let action: React.ReactNode = null;
    if (took && e.selfGrading) action = <a className="btn btn-wa btn-block" href={e.href}><Icon name="trophy" />{t.libSeeGrade}</a>;
    else if ((took || e.tab === "closed") && !e.selfGrading && e.results) {
      action = <ExamResults exams={[{ id: e.results.id, title: e.results.title, date: e.results.date }]} slug={slug} base={base} locale={locale} label={t.libSeeGrade} nameId={nameId} phoneId={phoneId} direct buttonClass="btn btn-wa btn-block" />;
    } else if (took && !e.selfGrading) action = <p className="lib-note">{t.libNoResultYet}</p>;
    else if (e.tab === "live") action = <a className="btn btn-wa btn-block" href={e.href}>{t.libEnter}</a>;
    else if (e.tab === "soon") action = <a className="btn btn-ghost btn-block" href={e.href}>{status}</a>;
    return (
      <article key={`q:${e.path}`} className="lib-exam">
        <div className="lib-exam-top">
          <span className={`lib-pill ${e.tab}`}>{status}</span>
          {e.showViews && n !== undefined && <span className="lib-views"><Icon name="users" /><span className="num">{tf(t.libTook, { n: n.toLocaleString("en-US") })}</span></span>}
          <ShareButton href={e.href} title={e.title} compact />
        </div>
        <h3><Marked text={e.title} query={q} /></h3>
        <div className="lib-exam-meta">
          <span>{e.minutes ? tf(t.libMinutes, { n: e.minutes }) : t.libNoTimer}</span>
          <span>{tf(t.libQuestions, { n: e.questions })}</span>
          <span>{e.selfGrading ? t.libSelf : t.libTeacher}</span>
          {e.tags.slice(0, 3).map((tag) => <span key={tag} className="lib-tag">#<Marked text={tag} query={q} /></span>)}
        </div>
        {action}
      </article>
    );
  };

  return (
    <div className="lib">
      <div className="lib-search" role="search">
        <label className="lib-box">
          <Icon name="search" />
          <span className="sr-only">{t.libSearchLabel}</span>
          <input type="search" value={q} placeholder={t.libSearchExams} autoComplete="off" enterKeyHint="search" onChange={(e) => setQ(e.target.value)} />
          {q && <button type="button" className="lib-clear" onClick={() => setQ("")} aria-label={t.libClear}><Icon name="close" /></button>}
        </label>
      </div>
      <div className="lib-tabs" role="tablist">
        {tabs.map((x) => {
          const n = found.filter((e) => e.tab === x.id).length;
          return (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={tab === x.id ? "on" : undefined} onClick={() => setTab(x.id)}>
              {x.label}<span className="num">{n}</span>
            </button>
          );
        })}
      </div>
      {inTab.length === 0 && <p className="lib-empty">{q ? t.libNone : t.libEmpty}</p>}
      {groups.map((g) => (
        <section key={g.name || "_"} className="lib-group">
          {g.name && <h2 className="lib-group-head"><span>{g.name}</span><small className="num">{g.items.length}</small></h2>}
          <div className="lib-cards exams">{g.items.map(({ e }) => card(e))}</div>
        </section>
      ))}
    </div>
  );
}
