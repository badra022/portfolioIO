"use client";

import { useState, useTransition } from "react";
import { savePartnerFormAction } from "@/app/sites/[site]/admin/partners/actions";
import { FIELD_TYPES, FIELD_TYPE_LABEL, type PartnerField, type PartnerForm } from "@/lib/partners";

const newId = () => `f${Math.random().toString(36).slice(2, 8)}`;

/**
 * The super admin's editor for one partner's sign-up page: the intro on top, the
 * color the form starts with, whether to ask for videos, and the partner's own
 * extra questions (shown in the form's last step, saved with each trial request).
 */
export function PartnerFormEditor({ id, value, pageUrl }: { id: string; value: PartnerForm; pageUrl: string }) {
  const [f, setF] = useState<PartnerForm>(value);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();
  const set = <K extends keyof PartnerForm>(k: K, v: PartnerForm[K]) => { setF((x) => ({ ...x, [k]: v })); setNote(null); };
  const setField = (i: number, patch: Partial<PartnerField>) => set("fields", f.fields.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) => {
    const list = [...f.fields];
    const [x] = list.splice(i, 1);
    list.splice(i + by, 0, x);
    set("fields", list);
  };
  const save = () => start(async () => {
    const clean = { ...f, fields: f.fields.map((x) => ({ ...x, label: x.label.trim(), options: x.type === "select" ? x.options.map((o) => o.trim()).filter(Boolean) : [] })) };
    setNote(await savePartnerFormAction(id, clean).catch(() => ({ ok: false, message: "حصلت مشكلة، جرّب تاني." })));
  });

  return (
    <div className="pf-editor">
      <label className="f-field"><span className="f-label">كلام أول الصفحة</span>
        <textarea rows={3} maxLength={600} value={f.intro} onChange={(e) => set("intro", e.target.value)} placeholder="املأ بيانات المدرس، والموقع بيتبني في دقيقة بكل أقسامه…" />
      </label>
      <div className="pf-row">
        <label className="f-field"><span className="f-label">اللون اللي الفورم يبدأ بيه</span>
          <span className="pf-color"><input type="color" value={f.color || "#1D6FE0"} onChange={(e) => set("color", e.target.value.toUpperCase())} />
            {f.color ? <button type="button" className="f-link" onClick={() => set("color", "")}>الافتراضي</button> : <small className="a-sub">الافتراضي</small>}</span>
        </label>
        <label className="pf-check"><input type="checkbox" checked={f.hideVideos} onChange={(e) => set("hideVideos", e.target.checked)} /> اخفي سؤال فيديوهات يوتيوب</label>
      </div>

      <h3>أسئلة إضافية للشريك ده بس</h3>
      <p className="a-sub">بتظهر في آخر خطوة في الفورم، وإجاباتها بتتحفظ مع طلب التجربة (في «طلبات التجربة» وملف Excel).</p>
      {f.fields.length === 0 && <p className="an-empty">مفيش أسئلة إضافية.</p>}
      <ol className="pf-fields">
        {f.fields.map((x, i) => (
          <li key={x.id} className="pf-field">
            <div className="pf-row">
              <label className="f-field grow"><span className="f-label">السؤال</span><input value={x.label} maxLength={80} onChange={(e) => setField(i, { label: e.target.value })} placeholder="مثلاً: اسم السنتر" /></label>
              <label className="f-field"><span className="f-label">النوع</span>
                <select value={x.type} onChange={(e) => setField(i, { type: e.target.value as PartnerField["type"] })}>
                  {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
                </select>
              </label>
            </div>
            {x.type === "select" ? (
              <label className="f-field"><span className="f-label">الاختيارات (كل اختيار في سطر)</span>
                <textarea rows={3} value={x.options.join("\n")} onChange={(e) => setField(i, { options: e.target.value.split("\n").map((o) => o.trimStart()).slice(0, 30) })} />
              </label>
            ) : (
              <label className="f-field"><span className="f-label">مثال جوه الخانة (اختياري)</span><input value={x.placeholder} maxLength={120} onChange={(e) => setField(i, { placeholder: e.target.value })} /></label>
            )}
            <div className="pf-actions">
              <label className="pf-check"><input type="checkbox" checked={x.required} onChange={(e) => setField(i, { required: e.target.checked })} /> لازم يتملا</label>
              <button type="button" className="btn-sm ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="لفوق">↑</button>
              <button type="button" className="btn-sm ghost" disabled={i === f.fields.length - 1} onClick={() => move(i, 1)} aria-label="لتحت">↓</button>
              <button type="button" className="btn-sm ghost danger" onClick={() => set("fields", f.fields.filter((_, j) => j !== i))}>شيل</button>
            </div>
          </li>
        ))}
      </ol>
      <div className="pf-actions">
        <button type="button" className="btn-sm ghost" disabled={f.fields.length >= 20}
          onClick={() => set("fields", [...f.fields, { id: newId(), label: "", type: "text", options: [], required: false, placeholder: "" }])}>+ سؤال</button>
        <button type="button" className="btn-sm primary" disabled={busy} onClick={save}>{busy ? "بيتحفظ…" : "احفظ الفورم"}</button>
        <a className="f-link" href={pageUrl} target="_blank" rel="noopener">شوف الصفحة ↗</a>
      </div>
      {note && <p className={`sa-note${note.ok ? " ok" : ""}`} role="status">{note.message}</p>}
    </div>
  );
}
