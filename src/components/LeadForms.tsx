"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LeadFormT } from "@/lib/schema";
import type { LeadTrigger } from "@/lib/lead";
import { CONVERT_EVENT } from "@/lib/analytics";
import { placeOf } from "@/lib/place";
import { Icon } from "./Icon";

type Open = { form: LeadFormT; trigger: LeadTrigger; place: string; ask: LeadFormT["fields"]; known: Record<string, string> };
type Toast = { text: string; tone: "ok" | "info"; edit?: Omit<Open, "ask"> };

const TYPE: Record<string, React.InputHTMLAttributes<HTMLInputElement>> = {
  tel: { type: "tel", inputMode: "tel", dir: "ltr", autoComplete: "tel" },
  number: { type: "text", inputMode: "decimal", dir: "ltr" },
  text: { type: "text" },
};

/**
 * Forms that buttons open instead of WhatsApp (see lib/lead.ts). Answers marked
 * "remember" (name, phone...) are kept on the student's device; when a form only
 * needs those, it is sent right away with a short confirmation ("not you? edit").
 * Shown as a card on tablets/desktops and a bottom sheet on phones.
 */
export function LeadForms({ forms, slug, base }: { forms: LeadFormT[]; slug: string; base: string }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const firstInput = useRef<HTMLElement | null>(null);
  const memKey = `lf:${slug}`;

  const remembered = useCallback((): Record<string, string> => {
    try { return JSON.parse(localStorage.getItem(memKey) ?? "{}") ?? {}; } catch { return {}; }
  }, [memKey]);

  const showToast = useCallback((t: Toast) => {
    clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), t.edit ? 8000 : 4000);
  }, []);

  const send = useCallback(async (o: Omit<Open, "ask">, answers: Record<string, string>, website = ""): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetch(`${base}/api/f`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ form: o.form.id, source: o.trigger.s, place: o.place, values: answers, context: o.trigger.c ?? {}, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 422 && data.errors) { setErrors(data.errors); return false; }
      if (!res.ok) { setErrors({ _: data.error ?? "حصلت مشكلة، حاول تاني." }); return false; }
      // Remember the student's traits (not the answers) for next time.
      const keep = { ...remembered() };
      for (const f of o.form.fields) if (f.remember && answers[f.id]) keep[f.id] = answers[f.id];
      try { localStorage.setItem(memKey, JSON.stringify(keep)); } catch { /* storage blocked */ }
      window.dispatchEvent(new CustomEvent(CONVERT_EVENT, { detail: { ch: "form", at: o.place } }));
      return true;
    } catch {
      setErrors({ _: "مفيش اتصال بالإنترنت؟ حاول تاني." });
      return false;
    } finally {
      setBusy(false);
    }
  }, [base, memKey, remembered]);

  const start = useCallback(async (trigger: LeadTrigger, el: Element) => {
    const form = forms.find((f) => f.id === trigger.f);
    if (!form) return;
    const known = remembered();
    const place = placeOf(el) ?? "other";
    const ask = form.fields.filter((f) => !(f.remember && known[f.id]));
    if (ask.length === 0) {
      // Everything needed is already known: send now, confirm with a way to correct it.
      const o = { form, trigger, place, known };
      const answers = Object.fromEntries(form.fields.map((f) => [f.id, known[f.id]]));
      setErrors({});
      if (await send(o, answers)) {
        const who = form.fields.filter((f) => f.type !== "tel").map((f) => known[f.id]).filter(Boolean)[0];
        showToast({ tone: "ok", text: `${form.successMessage}${who ? ` (${who})` : ""}`, edit: o });
        return;
      }
      // Stored values no longer pass (e.g. the form changed): ask for everything.
      setValues(answers);
      setOpen({ form, trigger, place, ask: form.fields, known: {} });
      return;
    }
    setValues(Object.fromEntries(form.fields.map((f) => [f.id, f.remember ? known[f.id] ?? "" : ""])));
    setErrors({});
    setDone(null);
    setOpen({ form, trigger, place, ask, known });
  }, [forms, remembered, send, showToast]);

  // One listener for every form button on the page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-lead]");
      if (!el) return;
      e.preventDefault();
      let t: LeadTrigger;
      try { t = JSON.parse(el.getAttribute("data-lead") ?? ""); } catch { return; }
      if (t.n) { showToast({ tone: "info", text: t.n }); return; }
      void start(t, el);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [start, showToast]);

  const close = useCallback(() => { setOpen(null); setDone(null); }, []);
  useEffect(() => {
    if (!open) return;
    firstInput.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!open) return;
    const answers = Object.fromEntries(open.form.fields.map((f) => [f.id, (values[f.id] ?? open.known[f.id] ?? "").trim()]));
    // Same checks as the server, so mistakes show instantly.
    const problems: Record<string, string> = {};
    for (const f of open.ask) {
      const v = answers[f.id];
      if (!v) { if (f.required) problems[f.id] = "مطلوب"; continue; }
      if (f.type === "tel" && !/^\+?\d{8,15}$/.test(v.replace(/[\s\-().]/g, "").replace(/^00/, "+"))) problems[f.id] = "اكتب رقم صحيح";
      if (f.type === "number" && !/^-?\d+([.,]\d+)?$/.test(v)) problems[f.id] = "اكتب رقم";
    }
    if (Object.keys(problems).length) { setErrors(problems); return; }
    const hp = (e.currentTarget as HTMLFormElement).elements.namedItem("website") as HTMLInputElement | null;
    if (await send(open, answers, hp?.value ?? "")) setDone(open.form.successMessage);
  };

  const knownShown = open ? open.form.fields.filter((f) => !open.ask.includes(f) && open.known[f.id]) : [];
  const context = Object.entries(open?.trigger.c ?? {});

  return (
    <>
      {open && (
        <div className="pop-layer lead-layer" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="pop lead" role="dialog" aria-modal="true" aria-labelledby="lead-title">
            <span className="pop-grip" aria-hidden="true" />
            <button type="button" className="pop-close" aria-label="إغلاق" onClick={close}><Icon name="close" /></button>
            {done ? (
              <div className="pop-body lead-done">
                <span className="lead-check" aria-hidden="true"><Icon name="check" /></span>
                <h2 id="lead-title">{done}</h2>
                <button type="button" className="btn btn-wa btn-block" onClick={close}>تمام</button>
              </div>
            ) : (
              <form className="pop-body lead-form" onSubmit={submit} noValidate>
                <h2 id="lead-title">{open.form.title}</h2>
                {open.form.intro && <p>{open.form.intro}</p>}
                {context.length > 0 && (
                  <dl className="lead-ctx">
                    {context.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                  </dl>
                )}
                {knownShown.length > 0 && (
                  <p className="lead-known">
                    {knownShown.map((f) => open.known[f.id]).join(" · ")}
                    <button type="button" className="lead-edit" onClick={() => setOpen({ ...open, ask: open.form.fields })}>تعديل</button>
                  </p>
                )}
                {open.ask.map((f, i) => {
                  const id = `lead-${f.id}`;
                  const common = {
                    id, name: f.id, value: values[f.id] ?? "", required: f.required, placeholder: f.placeholder,
                    "aria-invalid": errors[f.id] ? true : undefined,
                    ref: i === 0 ? (el: HTMLElement | null) => { firstInput.current = el; } : undefined,
                    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
                      const v = e.target.value;
                      setValues((x) => ({ ...x, [f.id]: v }));
                      setErrors((x) => ({ ...x, [f.id]: "" }));
                    },
                  };
                  return (
                    <label className="lead-field" key={f.id} htmlFor={id}>
                      <span>{f.label}{!f.required && <em> (اختياري)</em>}</span>
                      {f.type === "select" ? (
                        <select {...common}>
                          <option value="" disabled>اختر…</option>
                          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : f.type === "textarea" ? (
                        <textarea rows={3} {...common} />
                      ) : (
                        <input {...TYPE[f.type] ?? TYPE.text} autoComplete={f.id === "name" ? "name" : TYPE[f.type]?.autoComplete} {...common} />
                      )}
                      {errors[f.id] && <small className="lead-err" role="alert">{errors[f.id]}</small>}
                    </label>
                  );
                })}
                {/* Honeypot: invisible to people; bots that fill it are ignored by the server. */}
                <input className="lead-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" />
                {errors._ && <p className="lead-err" role="alert">{errors._}</p>}
                <button type="submit" className="btn btn-wa btn-block" disabled={busy}>
                  <Icon name="form" />{busy ? "جاري الإرسال…" : open.form.submitLabel}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      {toast && (
        <div className={`lead-toast ${toast.tone}`} role="status">
          <span>{toast.text}</span>
          {toast.edit && (
            <button type="button" onClick={() => {
              const o = toast.edit!;
              setToast(null);
              setValues(Object.fromEntries(o.form.fields.map((f) => [f.id, f.remember ? o.known[f.id] ?? "" : ""])));
              setErrors({});
              setDone(null);
              setOpen({ ...o, ask: o.form.fields });
            }}>مش انت؟ عدّل</button>
          )}
        </div>
      )}
    </>
  );
}
