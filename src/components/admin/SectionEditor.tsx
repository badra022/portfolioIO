"use client";

import { useEffect, useMemo, useState } from "react";
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
  const { site, sectionId, schema, assetBase, viewUrl, previewUrl } = props;
  const [value, setValue] = useState(props.initial);
  const [versions, setVersions] = useState({ production: props.version, preview: props.previewVersion });
  const [pending, setPending] = useState(props.pending);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

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
      setStatus({
        kind: "saved",
        text: target === "preview"
          ? (r.pending ? "اتحفظ في المعاينة بس. راجعه، وبعدين انشره على الموقع." : "اتحفظ في المعاينة (زي الموقع بالظبط).")
          : "اتنشر. التعديل ظاهر دلوقتي على الموقع.",
      });
      return;
    }
    switch (r.reason) {
      case "invalid":
        setIssues(r.issues);
        setStatus({ kind: "error", text: "في بيانات محتاجة تصحيح قبل الحفظ." });
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

  return (
    <form className="editor" onSubmit={(e) => { e.preventDefault(); void save("preview"); }}>
      {pending && !dirty && (
        <p className="a-envnote">
          القسم ده متعدّل في المعاينة ولسه مش منشور على الموقع. اللي قدامك هو نسخة المعاينة.{" "}
          <a href={previewUrl} target="_blank" rel="noopener">افتح المعاينة ↗</a>
        </p>
      )}
      {issues.length > 0 && (
        <div className="a-alert" role="alert">
          <strong>راجع الحقول التالية:</strong>
          <ul>{issues.map((i) => <li key={i.path}>{issueLabel(i.path)}: {i.message}</li>)}</ul>
        </div>
      )}
      <SchemaForm schema={schema} value={value} onChange={(v) => { setValue(v); setDirty(true); setStatus({ kind: "idle" }); }} ctx={ctx} />
      <div className="a-savebar">
        <span className={`a-status ${status.kind}`} aria-live="polite">
          {status.kind === "saving" ? "جاري الحفظ…" : status.text ?? (dirty ? "لديك تعديلات غير محفوظة." : "")}
        </span>
        <a className="btn-sm ghost" href={previewUrl} target="_blank" rel="noopener">المعاينة ↗</a>
        <a className="btn-sm ghost" href={viewUrl} target="_blank" rel="noopener">الموقع ↗</a>
        <button type="submit" className="btn-sm ghost" disabled={status.kind === "saving" || !dirty}>حفظ في المعاينة</button>
        <button type="button" className="btn-sm primary" disabled={status.kind === "saving" || (!dirty && !pending)} onClick={() => void save("production")}>نشر على الموقع</button>
      </div>
    </form>
  );
}
