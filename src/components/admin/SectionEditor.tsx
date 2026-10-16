"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveSectionAction, uploadImageAction } from "@/app/sites/[site]/admin/actions";
import type { JS } from "@/lib/admin/schema-tools";
import { labelFor } from "@/lib/admin/labels";
import { SchemaForm, type FormCtx } from "./SchemaForm";

type Issue = { path: string; message: string };
type Status = { kind: "idle" | "saving" | "saved" | "error"; text?: string };

function issueLabel(path: string): string {
  const parts = path.split(".");
  const names = parts.filter((p) => !/^\d+$/.test(p));
  const last = names[names.length - 1] ?? "";
  const index = parts.filter((p) => /^\d+$/.test(p)).map((n) => Number(n) + 1);
  return `${labelFor(path, last)}${index.length ? ` (رقم ${index.join("/")})` : ""}`;
}

export function SectionEditor(props: {
  site: string;
  sectionId: string;
  schema: JS;
  initial: Record<string, unknown>;
  /** Production and preview versions the page was opened at (two people editing at once). */
  version: number;
  previewVersion: number;
  /** This page's preview value differs from the public site (saved to preview, not published yet). */
  pending: boolean;
  assetBase: string;
  viewUrl: string;
  previewUrl: string;
  forms?: { id: string; title: string }[];
}) {
  const { site, sectionId, schema, assetBase, previewUrl } = props;
  const [value, setValue] = useState(props.initial);
  // The last saved value, for «تراجع».
  const [saved, setSaved] = useState(props.initial);
  // Remounting the form after an undo drops any pop-up it had open.
  const [formKey, setFormKey] = useState(0);
  const [live, setLive] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const [versions, setVersions] = useState({ production: props.version, preview: props.previewVersion });
  const [pending, setPending] = useState(props.pending);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    try { setLive(window.matchMedia("(min-width: 1200px)").matches && localStorage.getItem("a-live") !== "0"); } catch { /* storage blocked */ }
  }, []);
  const toggleLive = () => setLive((on) => {
    try { localStorage.setItem("a-live", on ? "0" : "1"); } catch { /* storage blocked */ }
    return !on;
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const ctx: FormCtx = useMemo(() => ({
    errors: Object.fromEntries(issues.map((i) => [i.path, i.message])),
    assetBase,
    forms: props.forms,
    upload: async (file: File) => {
      const fd = new FormData();
      fd.set("file", file);
      return uploadImageAction(site, fd);
    },
  }), [issues, assetBase, site, props.forms]);

  async function save(target: "preview" | "production") {
    setStatus({ kind: "saving" });
    const r = await saveSectionAction(site, sectionId, value, versions, target).catch(() => ({ ok: false as const, reason: "error" as const, message: "انقطع الاتصال. حاول مرة أخرى." }));
    if (r.ok) {
      setVersions({ production: r.version, preview: r.previewVersion });
      setPending(target === "preview" && r.pending);
      setIssues([]);
      setDirty(false);
      setSaved(value);
      setFrameKey((k) => k + 1);
      setStatus({
        kind: "saved",
        text: target === "preview"
          ? (r.pending ? "اتحفظ في المعاينة بس. راجعه، وبعدين انشره على الموقع." : "اتحفظ في المعاينة (زي الموقع بالظبط).")
          : "اتنشر. الطلاب شايفين التعديل دلوقتي.",
      });
      return;
    }
    switch (r.reason) {
      case "invalid":
        setIssues(r.issues);
        setStatus({ kind: "error", text: "في خانات محتاجة تصحيح قبل الحفظ." });
        break;
      case "conflict":
        setStatus({ kind: "error", text: "حد تاني حفظ تعديلات بعد ما فتحت الصفحة. انسخ تعديلاتك ثم أعد تحميل الصفحة." });
        break;
      case "forbidden":
        setStatus({ kind: "error", text: "غير مصرح لك بهذا التعديل." });
        break;
      default:
        setStatus({ kind: "error", text: ("message" in r && r.message) || "حدث خطأ أثناء الحفظ." });
    }
  }

  const undo = () => {
    if (!confirm("هترجع لآخر نسخة محفوظة وتتشال التعديلات اللي عملتها. متأكد؟")) return;
    setValue(saved);
    setFormKey((k) => k + 1);
    setDirty(false);
    setIssues([]);
    setStatus({ kind: "idle" });
  };
  const busy = status.kind === "saving";
  const state = busy ? "saving" : status.kind === "error" ? "error" : dirty ? "dirty" : pending ? "draft" : "clean";
  const stateText = busy ? "جاري الحفظ…"
    : status.text ?? (dirty ? "عندك تعديلات مش محفوظة" : pending ? "محفوظ في المعاينة، لسه مش منشور" : "كله محفوظ ومنشور");

  return (
    <form className={`editor${live ? " live" : ""}`} onSubmit={(e) => { e.preventDefault(); void save("preview"); }}>
      <div className="ed-form">
        {pending && !dirty && (
          <p className="a-envnote">
            القسم ده متعدّل في المعاينة ولسه مش منشور على الموقع. اللي قدامك هو نسخة المعاينة.{" "}
            <a href={previewUrl} target="_blank" rel="noopener">افتح المعاينة ↗</a>
          </p>
        )}
        {issues.length > 0 && (
          <div className="a-alert" role="alert">
            <strong>راجع الخانات دي:</strong>
            <ul>{issues.map((i) => <li key={i.path}>{issueLabel(i.path)}: {i.message}</li>)}</ul>
          </div>
        )}
        <SchemaForm key={formKey} schema={schema} value={value} onChange={(v) => { setValue(v); setDirty(true); setStatus({ kind: "idle" }); }} ctx={ctx} />
      </div>
      {live && (
        <aside className="ed-live" aria-label="معاينة حية">
          <div className="ed-live-head">
            <b>معاينة حية</b>
            <small>{dirty ? "احفظ عشان تشوف آخر تعديلاتك هنا" : "دي نسخة المعاينة، الطلاب مش شايفينها"}</small>
            <button type="button" className="f-link" onClick={() => frame.current?.contentWindow?.location.reload()}>تحديث</button>
          </div>
          <iframe key={frameKey} ref={frame} src={`${previewUrl}#${sectionId}`} title="معاينة الموقع" loading="lazy" />
        </aside>
      )}
      <div className="a-savebar">
        <span className={`a-status ${state}`} aria-live="polite"><i className="a-dot" aria-hidden="true" />{stateText}</span>
        <button type="button" className="btn-sm ghost ed-live-btn" aria-pressed={live} onClick={toggleLive}>{live ? "اقفل المعاينة" : "معاينة حية"}</button>
        <a className="btn-sm ghost ed-preview-link" href={previewUrl} target="_blank" rel="noopener">معاينة ↗</a>
        {dirty && <button type="button" className="btn-sm ghost" disabled={busy} onClick={undo}>تراجع</button>}
        <button type="submit" className="btn-sm ghost" disabled={busy || !dirty}>احفظ ومتنشرش</button>
        <button type="button" className="btn-sm primary" disabled={busy || (!dirty && !pending)} onClick={() => void save("production")}>احفظ وانشر</button>
      </div>
    </form>
  );
}
