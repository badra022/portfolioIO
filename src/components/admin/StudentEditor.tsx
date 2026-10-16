"use client";

import { useState } from "react";
import { updateStudentAction } from "@/app/sites/[site]/admin/actions";
import type { Traits } from "@/lib/server/students";

type Row = { key: string; label: string; value: string; by: "form" | "teacher" };

/** The teacher's edits to a profile: name, profile fields (edit, delete, add their own) and private notes. */
export function StudentEditor({ site, id, name: initialName, traits, notes: initialNotes }: { site: string; id: number; name: string; traits: Traits; notes: string }) {
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState<Row[]>(Object.entries(traits).map(([key, t]) => ({ key, label: t.label, value: t.value, by: t.by })));
  const [notes, setNotes] = useState(initialNotes);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const touched = () => { setDirty(true); setMsg(null); };
  const set = (i: number, patch: Partial<Row>) => { setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))); touched(); };

  const save = async () => {
    setBusy(true);
    const r = await updateStudentAction(site, id, { name, traits: rows.map(({ key, label, value }) => ({ key, label, value })), notes })
      .catch(() => ({ ok: false as const, message: "مفيش اتصال؟ حاول تاني." }));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.message }); return; }
    setDirty(false);
    setMsg({ ok: true, text: "اتحفظ." });
  };

  return (
    <section className="a-panel">
      <h2>بيانات الطالب</h2>
      <p className="a-sub">
        الخانات اللي جاية من النماذج بتتحدث لوحدها بآخر إجابة للطالب. اللي تكتبه أو تعدّله إنت بيفضل زي ما هو. ضيف أي بيانات تانية (رقم ولي الأمر، المدرسة، المجموعة…).
      </p>
      <div className="a-form">
        <label className="f-field">
          <span className="f-label">الاسم</span>
          <input value={name} onChange={(e) => { setName(e.target.value); touched(); }} />
        </label>
        <div className="st-traits">
          {rows.map((r, i) => (
            <div className="st-trait" key={r.key}>
              <input className="st-tl" value={r.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="اسم الخانة" aria-label="اسم الخانة" />
              <input value={r.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="القيمة" aria-label={r.label || "القيمة"} />
              <span className={`rq-badge ${r.by === "teacher" ? "contacted" : ""}`} title={r.by === "teacher" ? "إنت كتبتها" : "من نموذج"}>{r.by === "teacher" ? "يدوي" : "من نموذج"}</span>
              <button type="button" className="f-link danger" onClick={() => { setRows(rows.filter((_, j) => j !== i)); touched(); }}>حذف</button>
            </div>
          ))}
          <button type="button" className="f-add" onClick={() => { setRows([...rows, { key: `t_${Date.now().toString(36)}`, label: "", value: "", by: "teacher" }]); touched(); }}>+ خانة جديدة</button>
        </div>
        <label className="f-field">
          <span className="f-label">ملاحظات <em className="f-opt">(ليك بس)</em></span>
          <textarea rows={3} value={notes} onChange={(e) => { setNotes(e.target.value); touched(); }} placeholder="مثلاً: كلمت ولي أمره يوم ..." />
        </label>
        <div className="qz-actions">
          <button type="button" className="btn-sm primary" disabled={busy || !dirty} onClick={save}>{busy ? "جاري الحفظ…" : "حفظ"}</button>
          {msg && <span className={`a-status ${msg.ok ? "saved" : "error"}`} role="status">{msg.text}</span>}
        </div>
      </div>
    </section>
  );
}
