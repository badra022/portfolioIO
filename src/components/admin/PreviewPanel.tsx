"use client";

import { useState, useTransition } from "react";
import { discardPreviewAction, publishPreviewAction } from "@/app/sites/[site]/admin/actions";

/** The preview's unpublished edits on the admin home: open it, publish everything, or throw it away. */
export function PreviewPanel({ site, sections, previewUrl, by, at }: { site: string; sections: { id: string; title: string; href: string }[]; previewUrl: string; by: string | null; at: string | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = sections.length;
  return (
    <section className="hm-pending" aria-labelledby="hm-pending-h">
      <div className="hm-pending-text">
        <h2 id="hm-pending-h">{n === 1 ? "تعديل واحد" : n === 2 ? "تعديلين" : `${n} تعديلات`} لسه مش ظاهرة للطلاب</h2>
        <p>{by && at ? `آخر تعديل: ${by}، ${at}. ` : ""}الطلاب لسه شايفين النسخة القديمة لحد ما تنشر.</p>
        <div className="hm-chips">{sections.map((s) => <a key={s.id} className="hm-chip" href={s.href}>{s.title}</a>)}</div>
      </div>
      <div className="hm-pending-actions">
        <a className="btn-sm ghost" href={previewUrl} target="_blank" rel="noopener">معاينة ↗</a>
        <button type="button" className="btn-sm primary" disabled={pending} onClick={() => {
          if (!confirm("هتنشر كل التعديلات دي على الموقع. متأكد؟")) return;
          start(async () => { const r = await publishPreviewAction(site); setMsg(r.ok ? "اتنشرت على الموقع." : r.message); });
        }}>{pending ? "جاري…" : "انشر"}</button>
        <button type="button" className="f-link danger" disabled={pending} onClick={() => {
          if (!confirm("هتتمسح التعديلات اللي مش منشورة، والمعاينة ترجع زي الموقع. متأكد؟")) return;
          start(async () => { await discardPreviewAction(site); setMsg("اتلغت التعديلات."); });
        }}>إلغاء التعديلات</button>
      </div>
      {msg && <div className="a-result" role="status"><p>{msg}</p></div>}
    </section>
  );
}
