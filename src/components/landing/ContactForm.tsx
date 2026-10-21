"use client";

import { useState } from "react";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/phone";

const ROLES = [["teacher", "مدرس"], ["center", "سنتر"], ["agency", "وكالة تسويق / شريك"], ["other", "غير ذلك"]] as const;

/** «كلمنا»: name, WhatsApp number and a few words; saved for the super admin (admin/leads). */
export function ContactForm({ whatsapp }: { whatsapp: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setState("sending"); setErrors({}); setNote("");
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const r = await res.json().catch(() => ({}));
      if (r.ok) { setState("done"); return; }
      setErrors(r.errors ?? {}); setNote(r.message ?? (r.errors ? "" : "حصلت مشكلة، جرّب تاني أو كلمنا على واتساب."));
    } catch { setNote("مفيش اتصال بالإنترنت. جرّب تاني."); }
    setState("idle");
  }

  if (state === "done") {
    return (
      <div className="lp-form lp-form-done" role="status">
        <span className="lp-done-mark" aria-hidden="true">✓</span>
        <h3>وصلتنا رسالتك</h3>
        <p>هنكلمك على واتساب في أقرب وقت. لو مستعجل، ابعتلنا دلوقتي.</p>
        <a className="su-btn primary" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener">كلمنا على واتساب</a>
      </div>
    );
  }
  return (
    <form className="lp-form" onSubmit={submit} noValidate>
      <div className="lp-form-row">
        <label className="su-field"><span>الاسم</span>
          <input name="name" required autoComplete="name" aria-invalid={Boolean(errors.name)} />
          {errors.name && <small className="su-err">{errors.name}</small>}
        </label>
        <label className="su-field"><span>إنت</span>
          <select name="role" defaultValue="teacher">{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
      </div>
      <div className="su-field"><span id="lp-phone-l">رقم الواتساب</span>
        <div className="lp-phone-in">
          <select name="country" defaultValue={DEFAULT_COUNTRY} aria-label="الدولة">{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} +{c.code}</option>)}</select>
          <input name="phone" type="tel" inputMode="tel" dir="ltr" required autoComplete="tel-national" placeholder="01012345678" aria-labelledby="lp-phone-l" aria-invalid={Boolean(errors.phone)} />
        </div>
        {errors.phone && <small className="su-err">{errors.phone}</small>}
      </div>
      <label className="su-field"><span>المادة أو اسم السنتر <small>(اختياري)</small></span>
        <input name="subject" />
      </label>
      <label className="su-field"><span>عايز تعرف إيه؟ <small>(اختياري)</small></span>
        <textarea name="message" rows={3} />
      </label>
      <input className="lp-hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {note && <p className="su-err" role="alert">{note}</p>}
      <button type="submit" className="su-btn primary lg" disabled={state === "sending"}>{state === "sending" ? "بنبعت…" : "ابعت وهنكلمك"}</button>
      <p className="lp-form-note">بنستخدم رقمك عشان نرد عليك بس. مش هنبعتلك إعلانات.</p>
    </form>
  );
}
