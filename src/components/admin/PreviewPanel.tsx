"use client";

import { useState, useTransition } from "react";
import { discardPreviewAction, publishPreviewAction } from "@/app/sites/[site]/admin/actions";

/** The preview's unpublished edits on the admin home: open it, publish everything, or throw it away. */
export function PreviewPanel({ site, sections, previewUrl, by, at }: { site: string; sections: { id: string; title: string; href: string }[]; previewUrl: string; by: string | null; at: string | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="a-panel a-pending">
      <h2>تعديلات في المعاينة لسه مش منشورة</h2>
      <p className="a-sub">{by && at ? `آخر تعديل: ${by}، ${at}. ` : ""}الزوار لسه شايفين النسخة القديمة.</p>
      <ul>{sections.map((s) => <li key={s.id}><a href={s.href}>{s.title}</a></li>)}</ul>
      <div className="qz-actions">
        <a className="btn-sm ghost" href={previewUrl} target="_blank" rel="noopener">افتح المعاينة ↗</a>
        <button type="button" className="btn-sm primary" disabled={pending} onClick={() => {
          if (!confirm("هتنشر كل تعديلات المعاينة على الموقع. متأكد؟")) return;
          start(async () => { const r = await publishPreviewAction(site); setMsg(r.ok ? "اتنشرت على الموقع." : r.message); });
        }}>{pending ? "جاري…" : "نشر كل التعديلات على الموقع"}</button>
        <button type="button" className="btn-sm danger" disabled={pending} onClick={() => {
          if (!confirm("هتتمسح تعديلات المعاينة اللي مش منشورة، والمعاينة ترجع زي الموقع. متأكد؟")) return;
          start(async () => { await discardPreviewAction(site); setMsg("اتلغت تعديلات المعاينة."); });
        }}>إلغاء تعديلات المعاينة</button>
      </div>
      {msg && <div className="a-result" role="status"><p>{msg}</p></div>}
    </section>
  );
}
