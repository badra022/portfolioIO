"use client";

import { useState } from "react";
import { gradeAttemptAction } from "@/app/sites/[site]/admin/actions";
import { isPhoneKey, percentOf, phoneKey } from "@/lib/exam-results";

type Grade = { name: string; phone: string; score: string; note: string };

/**
 * The teacher's grade on one quiz submission: score, a comment for the student,
 * and approval. Approved grades go straight into the quiz's exam results, where
 * the student finds theirs with their name and phone (exams section).
 */
export function GradeBox({ site, path, id, initial, approved, total, reviewedBy }: {
  site: string;
  path: string;
  id: number;
  initial: Grade;
  approved: boolean;
  total: string | null;
  reviewedBy: string | null;
}) {
  const [g, setG] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<Grade>) => { setG({ ...g, ...patch }); setDirty(true); setMsg(null); };
  const badPhone = !isPhoneKey(phoneKey(g.phone));
  const pct = percentOf(g.score, total);

  const save = async (approve: boolean, done: string) => {
    setBusy(true);
    const r = await gradeAttemptAction(site, path, id, g, approve).catch(() => ({ ok: false as const, message: "مفيش اتصال؟ حاول تاني." }));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.message }); return; }
    setDirty(false);
    setMsg({ ok: true, text: done });
  };

  return (
    <div className={`gr-box${approved ? " approved" : ""}`}>
      <div className="gr-fields">
        <label className="f-field gr-score">
          <span className="f-label">الدرجة{total ? ` (من ${total})` : ""}</span>
          <span className="gr-score-in">
            <input value={g.score} inputMode="decimal" dir="ltr" onChange={(e) => set({ score: e.target.value })} placeholder={total ? `من ${total}` : "مثلاً 18"} />
            {pct !== null && <small className="a-sub">{pct}%</small>}
          </span>
        </label>
        <label className="f-field gr-note">
          <span className="f-label">تعليق للطالب <em className="f-opt">(اختياري، بيظهر له مع الدرجة)</em></span>
          <textarea rows={2} value={g.note} onChange={(e) => set({ note: e.target.value })} placeholder="مثلاً: ممتاز، راجع سؤال 3" />
        </label>
      </div>
      <details className="gr-who">
        <summary>
          الطالب بيدوّر بـ: <b>{g.name || "—"}</b> · <span dir="ltr">{g.phone || "—"}</span>
          {badPhone && <span className="rs-warn"> ⚠ من غير رقم صحيح مش هيلاقي نتيجته</span>}
        </summary>
        <div className="rs-grid">
          <label className="f-field"><span className="f-label">الاسم</span><input value={g.name} onChange={(e) => set({ name: e.target.value })} /></label>
          <label className="f-field"><span className="f-label">رقم الموبايل</span><input value={g.phone} dir="ltr" inputMode="tel" onChange={(e) => set({ phone: e.target.value })} /></label>
        </div>
        <p className="f-hint">جايين من بيانات الطالب في الاختبار. الطالب بيلاقي نتيجته لو الاسم الأول والرقم زي اللي هنا.</p>
      </details>
      <div className="qz-actions">
        {approved ? (
          <>
            <button type="button" className="btn-sm primary" disabled={busy || !dirty} onClick={() => save(true, "اتحفظ. الطالب هيشوف الدرجة الجديدة.")}>حفظ التعديل</button>
            <button type="button" className="btn-sm ghost" disabled={busy} onClick={() => save(false, "اتلغى الاعتماد: الطالب مش هيلاقي النتيجة دي لحد ما تعتمدها تاني.")}>إلغاء الاعتماد</button>
          </>
        ) : (
          <>
            <button type="button" className="btn-sm primary" disabled={busy || !g.score.trim()} onClick={() => save(true, "اتعتمدت: الطالب يقدر يشوف درجته دلوقتي من الموقع.")}>اعتماد الدرجة</button>
            <button type="button" className="btn-sm ghost" disabled={busy || !dirty} onClick={() => save(false, "اتحفظت كمسودة (الطالب مش شايفها).")}>حفظ كمسودة</button>
          </>
        )}
        {reviewedBy && !dirty && !msg && <span className="a-sub">آخر تصحيح: {reviewedBy}</span>}
      </div>
      {msg && <p className={`a-result ${msg.ok ? "ok" : "bad"}`} role="status">{msg.text}</p>}
    </div>
  );
}
