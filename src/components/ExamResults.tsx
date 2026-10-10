"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { LeadFormT } from "@/lib/schema";
import { percentOf } from "@/lib/exam-results";
import { dateParts } from "@/lib/format";
import { Icon } from "./Icon";
import { FormFields, checkFields } from "./FormFields";

type Field = LeadFormT["fields"][number];
export type PastExamItem = { id: number; title: string; date: string };
type Result = { title: string; date: string; total: string | null; name: string; score: string; note?: string };
type Step = { at: "list" } | { at: "ask"; exam: PastExamItem } | { at: "result"; exam: PastExamItem; result: Result | null };

/**
 * "Past exams' results" in the exams section: the student picks an exam and sees
 * their grade by name and phone. The name and phone are the same remembered
 * answers as the form buttons (LeadForms, same device storage and field ids), so a
 * student who already filled a form gets their result in one tap.
 */
export function ExamResults({ exams, slug, base, locale, label, intro, nameId, phoneId }: {
  exams: PastExamItem[];
  slug: string;
  base: string;
  locale: string;
  label: string;
  intro?: string;
  nameId: string;
  phoneId: string;
}) {
  const [step, setStep] = useState<Step | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const memKey = `lf:${slug}`;

  const fields: Field[] = [
    { id: nameId, label: "اسم الطالب", type: "text", required: true, remember: true, options: [], placeholder: "زي ما هو مكتوب عند المستر" },
    { id: phoneId, label: "رقم الموبايل", type: "tel", required: true, remember: true, options: [], placeholder: "01xxxxxxxxx" },
  ];

  const remembered = useCallback((): Record<string, string> => {
    try { return JSON.parse(localStorage.getItem(memKey) ?? "{}") ?? {}; } catch { return {}; }
  }, [memKey]);

  const lookup = useCallback(async (exam: PastExamItem, name: string, phone: string) => {
    setBusy(true);
    setErrors({});
    try {
      const res = await fetch(`${base}/api/r`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exam: exam.id, name, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 422 && data.errors) {
        setErrors({ [nameId]: data.errors.name ?? "", [phoneId]: data.errors.phone ?? "" });
        setStep({ at: "ask", exam });
        return;
      }
      if (!res.ok) { setErrors({ _: data.error ?? "حصلت مشكلة، حاول تاني." }); setStep({ at: "ask", exam }); return; }
      if (data.found) {
        // Same storage as the form buttons: next time (and on any form) the student isn't asked again.
        try { localStorage.setItem(memKey, JSON.stringify({ ...remembered(), [nameId]: name, [phoneId]: phone })); } catch { /* storage blocked */ }
      }
      setStep({ at: "result", exam, result: data.found ? data.result : null });
    } catch {
      setErrors({ _: "مفيش اتصال بالإنترنت؟ حاول تاني." });
      setStep({ at: "ask", exam });
    } finally {
      setBusy(false);
    }
  }, [base, memKey, nameId, phoneId, remembered]);

  const pick = (exam: PastExamItem) => {
    const known = remembered();
    const name = known[nameId] ?? "", phone = known[phoneId] ?? "";
    setValues({ [nameId]: name, [phoneId]: phone });
    setErrors({});
    if (name && phone) void lookup(exam, name, phone);
    else setStep({ at: "ask", exam });
  };

  const close = useCallback(() => setStep(null), []);
  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, close]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step?.at !== "ask") return;
    const answers = { [nameId]: (values[nameId] ?? "").trim(), [phoneId]: (values[phoneId] ?? "").trim() };
    const problems = checkFields(fields, answers);
    if (Object.keys(problems).length) { setErrors(problems); return; }
    void lookup(step.exam, answers[nameId], answers[phoneId]);
  };

  const when = (d: string) => dateParts(d, locale).short;
  const exam = step && step.at !== "list" ? step.exam : null;

  return (
    <div className="exr">
      {intro && <p className="exr-intro">{intro}</p>}
      <button type="button" className="btn btn-ghost" onClick={() => { setErrors({}); setStep({ at: "list" }); }}>
        <Icon name="trophy" />{label}
      </button>
      {/* At the page root, like the form buttons' dialog: inside the section it would sit under the sticky bar. */}
      {step && createPortal(
        <div className="pop-layer lead-layer" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="pop lead" role="dialog" aria-modal="true" aria-labelledby="exr-title">
            <span className="pop-grip" aria-hidden="true" />
            <button type="button" className="pop-close" aria-label="إغلاق" onClick={close}><Icon name="close" /></button>

            {step.at === "list" && (
              <div className="pop-body lead-form">
                <h2 id="exr-title">{label}</h2>
                <p>اختار الامتحان اللي عايز تعرف نتيجتك فيه.</p>
                <ul className="exr-list">
                  {exams.map((x) => (
                    <li key={x.id}>
                      <button type="button" onClick={() => pick(x)} disabled={busy}>
                        <b>{x.title}</b>
                        <span>{when(x.date)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {busy && <p className="exr-wait" role="status">جاري البحث عن نتيجتك…</p>}
              </div>
            )}

            {step.at === "ask" && exam && (
              <form className="pop-body lead-form" onSubmit={submit} noValidate>
                <h2 id="exr-title">نتيجتك في {exam.title}</h2>
                <p>اكتب اسمك ورقم الموبايل اللي مسجّل بيه عند المستر.</p>
                <FormFields
                  fields={fields}
                  values={values}
                  errors={errors}
                  idPrefix="exr"
                  onChange={(id, v) => { setValues((x) => ({ ...x, [id]: v })); setErrors((x) => ({ ...x, [id]: "" })); }}
                />
                {errors._ && <p className="lead-err" role="alert">{errors._}</p>}
                <button type="submit" className="btn btn-wa btn-block" disabled={busy}>
                  <Icon name="trophy" />{busy ? "جاري البحث…" : "اعرف نتيجتك"}
                </button>
                <button type="button" className="lead-edit" onClick={() => setStep({ at: "list" })}>← امتحان تاني</button>
              </form>
            )}

            {step.at === "result" && exam && (
              <div className="pop-body lead-form">
                <h2 id="exr-title">{exam.title}</h2>
                <p>{when(exam.date)}</p>
                {step.result ? <Score r={step.result} /> : (
                  <div className="exr-miss" role="status">
                    <b>مش لاقيين نتيجة بالاسم والرقم دول.</b>
                    <span>اتأكد إنك كاتب اسمك الأول صح، ونفس رقم الموبايل اللي سجلت بيه عند المستر.</span>
                  </div>
                )}
                <p className="lead-known">
                  {values[nameId]} · <span dir="ltr">{values[phoneId]}</span>
                  <button type="button" className="lead-edit" onClick={() => setStep({ at: "ask", exam })}>{step.result ? "مش انت؟ عدّل" : "عدّل البيانات"}</button>
                </p>
                <button type="button" className="btn btn-ghost btn-block" onClick={() => setStep({ at: "list" })}>امتحان تاني</button>
              </div>
            )}
          </div>
        </div>,
        document.querySelector(".site") ?? document.body,
      )}
    </div>
  );
}

function Score({ r }: { r: Result }) {
  const pct = percentOf(r.score, r.total);
  return (
    <div className="exr-score">
      <span className="exr-name">{r.name}</span>
      <div className="exr-num num" dir="ltr">
        <b>{r.score || "—"}</b>
        {r.total && <span>/ {r.total}</span>}
      </div>
      {pct !== null && (
        <div className="exr-bar" role="img" aria-label={`${pct}%`}>
          <i style={{ width: `${pct}%` }} />
          <small className="num">{pct}%</small>
        </div>
      )}
      {r.note && <p className="exr-note">{r.note}</p>}
    </div>
  );
}
