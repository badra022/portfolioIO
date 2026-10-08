"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LeadFormT, QuizT } from "@/lib/schema";
import { availability, type PublicQuestion } from "@/lib/quiz";
import { instantOf } from "@/lib/dates";
import { FormFields, checkFields } from "./FormFields";
import { Icon } from "./Icon";

/** What the page knows about the quiz before it starts (no questions, no answer key). */
export type QuizSummary = Pick<QuizT, "path" | "title" | "intro" | "image" | "durationMinutes" | "state" | "startsAt" | "endsAt" | "startLabel" | "submitLabel" | "doneMessage"> & { count: number };

type Attempt = { token: string; status: "in_progress" | "submitted" | "timed_out"; questions: PublicQuestion[]; answers: Record<string, string>; deadline: number | null; now: number };
type Saved = { token: string; answers: Record<string, string>; done?: boolean };
type Phase = "loading" | "intro" | "quiz" | "done";

const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};
const fmtWhen = (v: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }).format(instantOf(v));

/**
 * A quiz page: the quiz's form first (nothing is sent but the start), then the
 * questions with a countdown. The server keeps the deadline and the answers, so a
 * refresh resumes where the student was (same answers, same remaining time); the
 * browser also keeps the answers, in case it was offline. Time up or the submit
 * button hands everything in; after that the quiz can't be taken again here.
 */
export function QuizApp({ slug, base, quiz, form }: { slug: string; base: string; quiz: QuizSummary; form: LeadFormT | null }) {
  const key = `quiz:${slug}:${quiz.path}`;
  const memKey = `lf:${slug}`;
  const endpoint = `${base}/api/quiz`;
  const [phase, setPhase] = useState<Phase>("loading");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [doneHow, setDoneHow] = useState<"submitted" | "timed_out" | "already">("submitted");
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(0); // server clock - this device's clock
  const answersRef = useRef(answers);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const submitting = useRef(false);
  answersRef.current = answers;

  const store = useCallback((s: Saved | null) => {
    try { if (s) localStorage.setItem(key, JSON.stringify(s)); else localStorage.removeItem(key); } catch { /* storage blocked */ }
  }, [key]);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({ ok: false, error: "network" }));
    return { status: res.status, data } as { status: number; data: { ok: boolean; attempt?: Attempt; error?: string; errors?: Record<string, string>; resumed?: boolean } };
  }, [endpoint]);

  const enter = useCallback((a: Attempt, local?: Record<string, string>, resumed = false) => {
    offset.current = a.now - Date.now();
    setAttempt(a);
    if (a.status !== "in_progress") {
      setDoneHow(resumed ? "already" : a.status);
      store({ token: a.token, answers: a.answers, done: true });
      setPhase("done");
      return;
    }
    // This device may hold newer answers than the server's last autosave.
    const merged = { ...a.answers, ...(local ?? {}) };
    setAnswers(merged);
    store({ token: a.token, answers: merged });
    setPhase("quiz");
  }, [store]);

  // On load: continue an attempt this device started, if any.
  useEffect(() => {
    let saved: Saved | null = null;
    try { saved = JSON.parse(localStorage.getItem(key) ?? "null"); } catch { saved = null; }
    try {
      const known = JSON.parse(localStorage.getItem(memKey) ?? "{}") ?? {};
      if (form) setValues(Object.fromEntries(form.fields.filter((f) => f.remember && known[f.id]).map((f) => [f.id, known[f.id]])));
    } catch { /* ignore */ }
    if (!saved?.token) { setPhase("intro"); return; }
    if (saved.done) { setDoneHow("already"); setPhase("done"); }
    call({ op: "resume", token: saved.token })
      .then(({ status, data }) => {
        if (data.ok && data.attempt) enter(data.attempt, saved!.done ? undefined : saved!.answers, saved!.done);
        else if (status === 404) { store(null); setPhase("intro"); } // the teacher removed the attempt: can start again
        else if (!saved!.done) setPhase("intro");
      })
      .catch(() => { if (!saved!.done) { setNote("مفيش اتصال بالإنترنت. أعد تحميل الصفحة لما يرجع."); setPhase("intro"); } });
  }, [key, memKey, form, call, enter, store]);

  // Opening time: re-check every 15 s while waiting for the quiz to open.
  useEffect(() => {
    if (phase !== "intro") return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [phase]);

  const submit = useCallback(async (auto: boolean) => {
    if (!attempt || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setNote(auto ? "انتهى الوقت، جاري تسليم إجاباتك…" : "جاري التسليم…");
    clearTimeout(saveTimer.current);
    for (let tries = 0; tries < 20; tries++) {
      try {
        const { data } = await call({ op: "submit", token: attempt.token, answers: answersRef.current });
        if (data.ok && data.attempt) {
          setNote("");
          enter(data.attempt);
          return;
        }
      } catch { /* offline: retry */ }
      setNote("مفيش اتصال… هنحاول نسلّم تاني تلقائياً، متقفلش الصفحة.");
      await new Promise((r) => setTimeout(r, 5000));
    }
    submitting.current = false;
    setBusy(false);
  }, [attempt, call, enter]);

  // Countdown from the server's deadline (not this device's clock).
  useEffect(() => {
    if (phase !== "quiz" || !attempt?.deadline) { setLeft(null); return; }
    const tick = () => {
      const ms = attempt.deadline! - (Date.now() + offset.current);
      setLeft(ms);
      if (ms <= 0) void submit(true);
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [phase, attempt, submit]);

  // Autosave: on this device at once, on the server shortly after; immediately when the page is hidden.
  const answer = (i: number, v: string) => {
    setAnswers((a) => {
      const next = { ...a, [String(i)]: v };
      if (attempt) store({ token: attempt.token, answers: next });
      return next;
    });
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (attempt && !submitting.current) call({ op: "save", token: attempt.token, answers: answersRef.current }).then(({ data }) => {
        if (data.attempt && data.attempt.status !== "in_progress") enter(data.attempt);
      }).catch(() => {});
    }, 2000);
  };
  useEffect(() => {
    if (phase !== "quiz" || !attempt) return;
    const flush = () => {
      if (document.visibilityState !== "hidden" || submitting.current) return;
      const body = JSON.stringify({ op: "save", token: attempt.token, answers: answersRef.current });
      navigator.sendBeacon?.(endpoint, new Blob([body], { type: "text/plain" }));
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [phase, attempt, endpoint]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form) {
      const problems = checkFields(form.fields, values);
      if (Object.keys(problems).length) { setErrors(problems); return; }
    }
    setBusy(true);
    setNote("");
    try {
      const { data } = await call({ op: "start", quiz: quiz.path, values });
      if (data.ok && data.attempt) {
        if (form) {
          try {
            const keep = JSON.parse(localStorage.getItem(memKey) ?? "{}") ?? {};
            for (const f of form.fields) if (f.remember && values[f.id]) keep[f.id] = values[f.id];
            localStorage.setItem(memKey, JSON.stringify(keep));
          } catch { /* ignore */ }
        }
        enter(data.attempt, undefined, data.resumed && data.attempt.status !== "in_progress");
        window.scrollTo({ top: 0 });
      } else if (data.errors) setErrors(data.errors);
      else setNote(data.error === "notYet" ? "الاختبار لسه مبدأش." : data.error === "over" || data.error === "closed" ? "الاختبار اتقفل." : "حصلت مشكلة، حاول تاني.");
    } catch {
      setNote("مفيش اتصال بالإنترنت؟ حاول تاني.");
    } finally {
      setBusy(false);
    }
  };

  const avail = availability({ state: quiz.state, startsAt: quiz.startsAt, endsAt: quiz.endsAt, questions: { length: quiz.count } }, now);
  const questions = attempt?.questions ?? [];
  const answered = questions.filter((_, i) => (answers[String(i)] ?? "").trim() !== "").length;

  return (
    <div className="quiz">
      {phase === "loading" && <p className="quiz-muted">جاري التحميل…</p>}

      {phase === "intro" && (
        <form className="quiz-card" onSubmit={start} noValidate>
          {quiz.image && <img className="quiz-cover" src={quiz.image} alt="" />}
          <h1>{quiz.title}</h1>
          {quiz.intro && <p className="quiz-intro">{quiz.intro}</p>}
          <div className="quiz-facts">
            <span><Icon name="check" />{quiz.count} سؤال</span>
            <span><Icon name="calendar" />{quiz.durationMinutes > 0 ? `${quiz.durationMinutes} دقيقة` : "بدون وقت محدد"}</span>
            {quiz.state === "auto" && quiz.endsAt && avail.open && <span>متاح حتى {fmtWhen(quiz.endsAt)}</span>}
          </div>
          {avail.open ? (
            <>
              {form && (
                <div className="quiz-form">
                  {form.intro && <p className="quiz-muted">{form.intro}</p>}
                  <FormFields fields={form.fields} values={values} errors={errors} idPrefix="quiz"
                    onChange={(id, v) => { setValues((x) => ({ ...x, [id]: v })); setErrors((x) => ({ ...x, [id]: "" })); }} />
                </div>
              )}
              {quiz.durationMinutes > 0 && <p className="quiz-muted">الوقت بيبدأ أول ما تضغط، ومش هتقدر تدخل الاختبار تاني بعد التسليم.</p>}
              {note && <p className="lead-err" role="alert">{note}</p>}
              <button type="submit" className="btn btn-wa btn-block" disabled={busy}><Icon name="bolt" />{busy ? "لحظة…" : quiz.startLabel}</button>
            </>
          ) : (
            <p className="quiz-closed">
              {avail.reason === "notYet" && avail.at ? `الاختبار هيبدأ ${fmtWhen(avail.at)}. الصفحة هتفتح لوحدها.` :
                avail.reason === "over" ? "الاختبار انتهى." :
                avail.reason === "empty" ? "الاختبار لسه بيتجهز." : "الاختبار مقفول دلوقتي."}
            </p>
          )}
        </form>
      )}

      {phase === "quiz" && attempt && (
        <>
          <div className={`quiz-bar${left !== null && left < 60_000 ? " hurry" : ""}`}>
            <div className="wrap">
              <b>{quiz.title}</b>
              <span className="quiz-progress num">{answered}/{questions.length}</span>
              {left !== null && <span className="quiz-timer num" dir="ltr" aria-live="off"><Icon name="calendar" />{fmtClock(left)}</span>}
            </div>
          </div>
          <ol className="quiz-qs">
            {questions.map((q, i) => (
              <li key={i} className="q quiz-q">
                <span className="q-lvl">سؤال {i + 1}</span>
                {q.image && <img className="quiz-img" src={q.image} alt="" loading="lazy" />}
                {q.text && <h3>{q.text}</h3>}
                {q.type === "choice" && q.options.length > 0 ? (
                  <div className="answers">
                    {q.options.map((o, j) => (
                      <label className="ans" key={j}>
                        <input type="radio" name={`qq${i}`} checked={answers[String(i)] === o} onChange={() => answer(i, o)} disabled={busy} />
                        <span>{o}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea className="quiz-text" rows={2} value={answers[String(i)] ?? ""} placeholder="اكتب إجابتك"
                    onChange={(e) => answer(i, e.target.value)} disabled={busy} />
                )}
              </li>
            ))}
          </ol>
          <div className="quiz-submit">
            {note && <p className="quiz-muted" role="status">{note}</p>}
            {confirming ? (
              <>
                <p>{answered < questions.length ? `فاضل ${questions.length - answered} سؤال من غير إجابة. ` : ""}متأكد؟ مش هتقدر تعدّل بعد التسليم.</p>
                <div className="cta-row">
                  <button type="button" className="btn btn-wa" disabled={busy} onClick={() => void submit(false)}><Icon name="check" />تأكيد التسليم</button>
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>رجوع</button>
                </div>
              </>
            ) : (
              <button type="button" className="btn btn-wa btn-block" disabled={busy} onClick={() => setConfirming(true)}><Icon name="check" />{quiz.submitLabel}</button>
            )}
          </div>
        </>
      )}

      {phase === "done" && (
        <div className="quiz-card quiz-done">
          <span className="lead-check" aria-hidden="true"><Icon name="check" /></span>
          <h1>{quiz.title}</h1>
          <p>{doneHow === "timed_out" ? "انتهى الوقت وتم تسليم إجاباتك تلقائياً." : doneHow === "already" ? "انت سلّمت الاختبار ده قبل كده." : quiz.doneMessage}</p>
          <a className="btn btn-ghost" href={`${base}/`}>الرجوع للموقع</a>
        </div>
      )}
    </div>
  );
}
