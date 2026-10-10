import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { copyFor, getTenant } from "@/lib/server/repo";
import { adminEnv } from "@/lib/server/admin-env";
import { listAttempts, quizMetrics } from "@/lib/server/quiz-attempts";
import { availability } from "@/lib/quiz";
import { deadline } from "@/lib/dates";
import { formatWhen } from "@/lib/admin/format";
import { QuizStateButtons, quizStatus } from "@/components/admin/QuizBits";
import { deleteAttemptAction } from "../../actions";

export const metadata: Metadata = { title: "نتايج الاختبار" };

const STATUS: Record<string, { label: string; tone: string }> = {
  submitted: { label: "سلّم", tone: "contacted" },
  timed_out: { label: "انتهى الوقت", tone: "" },
  in_progress: { label: "بيحل دلوقتي", tone: "new" },
};
const mins = (s: number | null) => (s === null ? "—" : s < 60 ? `${s} ث` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} د`);
const waNumber = (v: string) => { const d = v.replace(/\D/g, ""); return /^01\d{9}$/.test(d) ? `2${d}` : d; };

export default async function QuizResults({ params, searchParams }: PageProps<"/sites/[site]/admin/quizzes/[path]">) {
  const { site: raw, path } = await params;
  const site = decodeURIComponent(raw);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  const env = await adminEnv();
  const content = t ? copyFor(t, env).content : null;
  const quiz = content?.quizzes.find((q) => q.path === decodeURIComponent(path));
  if (!slug || !t || !content || !quiz) notFound();
  const form = quiz.form ? content.forms.find((f) => f.id === quiz.form) : undefined;
  const rows = await listAttempts(slug, quiz, env);
  const m = quizMetrics(quiz, rows);
  const sort = (await searchParams).sort === "score" ? "score" : "time";
  const sorted = sort === "score"
    ? [...rows].sort((a, b) => (b.graded.percent ?? -1) - (a.graded.percent ?? -1) || (a.seconds ?? 1e9) - (b.seconds ?? 1e9))
    : rows;
  const base = baseForSite(site);
  const s = quizStatus(quiz, availability(quiz));
  const fieldLabel = (id: string) => form?.fields.find((f) => f.id === id)?.label ?? id;
  const isTel = (id: string) => form?.fields.find((f) => f.id === id)?.type === "tel";
  const finished = m.submitted + m.timedOut;
  const maxBand = Math.max(1, ...m.bands.map((b) => b.value));
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

  return (
    <>
      <div className="a-head">
        <a className="a-back" href={`${base}/admin/quizzes`}>→ الاختبارات</a>
        <h1>{quiz.title}</h1>
        <p className="a-sub">
          <span className={`rq-badge ${s.tone}`}>{s.label}</span>{" "}
          <a dir="ltr" href={`${base}/${quiz.path}`} target="_blank" rel="noopener">/{quiz.path}</a>
          {" · "}{quiz.questions.length} سؤال · {quiz.durationMinutes ? `${quiz.durationMinutes} دقيقة` : "بدون وقت"}
          {quiz.endsAt && quiz.state === "auto" ? ` · ينتهي ${formatWhen(deadline(quiz.endsAt).toISOString())}` : ""}
        </p>
        <div className="a-actions">
          <QuizStateButtons site={site} path={quiz.path} state={quiz.state} env={env} />
          <a className="btn-sm ghost" href={`${base}/admin/edit/quizzes`}>تعديل الأسئلة</a>
          <a className="btn-sm ghost" href={`${base}/admin/quizzes/${quiz.path}/export`}>تنزيل Excel (CSV)</a>
        </div>
      </div>

      <div className="an-tiles">
        <div className="an-tile strong"><span>بدأوا</span><b>{m.started}</b><small>{m.inProgress ? `${m.inProgress} بيحلوا دلوقتي` : " "}</small></div>
        <div className="an-tile strong"><span>سلّموا</span><b>{finished}</b><small>{m.completion}% من اللي بدأوا · {m.timedOut} انتهى وقتهم</small></div>
        {m.graded && <div className="an-tile"><span>متوسط الدرجات</span><b dir="ltr">{pct(m.avgPercent)}</b><small>الوسيط {pct(m.medianPercent)} · أعلى درجة {pct(m.topPercent)}</small></div>}
        {m.graded && <div className="an-tile"><span>نسبة النجاح</span><b dir="ltr">{pct(m.passRate)}</b><small>النجاح من {quiz.passPercent}%</small></div>}
        <div className="an-tile"><span>متوسط وقت الحل</span><b>{mins(m.avgSeconds)}</b></div>
      </div>
      {!m.graded && <p className="a-alert">مفيش إجابات صحيحة متسجلة للأسئلة، فمفيش تصحيح. ضيفها من «تعديل الأسئلة» والنتايج هتتحسب لوحدها، حتى للي سلّموا قبل كده.</p>}

      {m.graded && finished > 0 && (
        <section className="a-panel an-bars">
          <h2>توزيع الدرجات</h2>
          <ul>
            {m.bands.map((b) => (
              <li key={b.key}>
                <span className="an-lbl" dir="ltr">{b.key}%</span>
                <span className="an-track">{b.value > 0 && <i style={{ inlineSize: `${(b.value / maxBand) * 100}%` }} />}</span>
                <span className="an-val">{b.value}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {finished > 0 && (
        <section className="a-panel">
          <h2>الأسئلة</h2>
          <p className="a-sub">{m.graded ? "الأصعب أولاً. " : ""}نسبة اللي جاوبوا، ونسبة الإجابات الصحيحة، وأكتر إجابات غلط.</p>
          <div className="qz-qtable">
            {[...m.questions].sort((a, b) => (a.correctRate ?? 101) - (b.correctRate ?? 101)).map((q) => (
              <div key={q.index} className="qz-qrow">
                <b>س{q.index + 1}</b>
                <span className="qz-qtext">{q.text}</span>
                <span className="a-sub">جاوب {q.answered}%</span>
                {q.correctRate !== null && <span className={`rq-badge ${q.correctRate < 50 ? "new" : "contacted"}`}>صح {q.correctRate}%</span>}
                {q.topWrong.length > 0 && <span className="a-sub qz-wrong">أكتر غلط: {q.topWrong.map((w) => `«${w.answer}» (${w.count})`).join("، ")}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="a-panel">
        <div className="qz-head">
          <h2>الطلاب ({rows.length})</h2>
          <nav className="an-ranges">
            <a href="?sort=time" aria-current={sort === "time" ? "page" : undefined}>الأحدث</a>
            {m.graded && <a href="?sort=score" aria-current={sort === "score" ? "page" : undefined}>الأعلى درجة</a>}
          </nav>
        </div>
        {rows.length === 0 && <p className="an-empty">محدش بدأ الاختبار لسه.</p>}
        <ul className="rq-list">
          {sorted.map((r, i) => {
            const st = STATUS[r.status];
            const passed = r.graded.percent !== null && r.graded.percent >= quiz.passPercent;
            return (
              <li key={r.id} className={`rq qz-attempt${r.status === "in_progress" ? " rq-new" : ""}`}>
                <div className="rq-top">
                  {sort === "score" && <b className="qz-rank">#{i + 1}</b>}
                  <span className={`rq-badge ${st.tone}`}>{st.label}</span>
                  {r.graded.max > 0 && r.status !== "in_progress" && (
                    <b className={`qz-score ${passed ? "pass" : "fail"}`} dir="ltr">{r.graded.score}/{r.graded.max} · {r.graded.percent}%</b>
                  )}
                  <span className="a-sub">{formatWhen(r.startedAt)} · {mins(r.seconds)}</span>
                </div>
                <dl className="rq-data">
                  {Object.entries(r.fields).map(([k, v]) => (
                    <div key={k}><dt>{fieldLabel(k)}</dt><dd>{isTel(k) ? (
                      <span className="rq-phone"><a dir="ltr" href={`tel:${v}`}>{v}</a><a className="rq-wa" href={`https://wa.me/${waNumber(v)}`} target="_blank" rel="noopener noreferrer">واتساب</a></span>
                    ) : v}</dd></div>
                  ))}
                </dl>
                <details className="qz-answers">
                  <summary>الإجابات</summary>
                  <ol>
                    {r.questions.map((q, qi) => {
                      const mark = r.graded.marks[qi];
                      const a = r.answers[String(qi)] ?? "";
                      return (
                        <li key={qi} className={mark === true ? "ok" : mark === false ? "bad" : ""}>
                          <span className="qz-qtext">{q.text || `سؤال ${qi + 1}`}</span>
                          <b>{a || "— بدون إجابة —"}</b>
                          {mark !== null && mark !== undefined && <span>{mark ? "✓" : `✗ الصحيح: ${quiz.questions[qi]?.correct.join(" / ")}`}</span>}
                        </li>
                      );
                    })}
                  </ol>
                </details>
                <div className="rq-foot">
                  <span className="a-sub">{r.finishedAt ? `سلّم ${formatWhen(r.finishedAt)}` : "لسه بيحل"}</span>
                  <details className="a-confirm">
                    <summary className="f-link danger">حذف (يسمح له يدخل تاني)</summary>
                    <form action={deleteAttemptAction.bind(null, site, quiz.path, [r.id])}>
                      <button type="submit" className="btn-sm danger">تأكيد الحذف</button>
                    </form>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
