"use client";
import { useState } from "react";
import { shrinkForUpload } from "@/lib/shrink-image";

type Result = { name: string; key?: string; url?: string; error?: string };

/** Multi-photo upload for a signed link; uploads in small batches and lists what was stored. */
export function Uploader({ slug, exp, sig }: { slug: string; exp: string; sig: string }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState("");

  const send = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      // One request per photo keeps each under the 4.5 MB request limit.
      for (const f of files) {
        const form = new FormData();
        form.set("t", slug); form.set("e", exp); form.set("s", sig);
        form.append("file", await shrinkForUpload(f));
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json().catch(() => ({ error: "خطأ غير متوقع." }));
        if (!res.ok) { setError(data.error ?? "تعذّر الرفع."); break; }
        setResults((r) => [...data.results, ...r]);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <label
        className="up-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); send(Array.from(e.dataTransfer.files)); }}
      >
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple disabled={busy}
          onChange={(e) => { send(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        <strong>{busy ? "جاري الرفع…" : "اختار صور أو اسحبها هنا"}</strong>
        <span className="a-sub">JPG, PNG, WEBP · صور الموبايل الكبيرة بتتصغّر تلقائياً</span>
      </label>
      {error && <div className="a-result bad"><p>{error}</p></div>}
      {results.length > 0 && (
        <ul className="up-list">
          {results.map((r, i) => (
            <li key={`${r.key ?? r.name}-${i}`} className={r.error ? "bad" : "ok"}>
              {r.url && <img src={r.url} alt="" />}
              <span><b dir="ltr">{r.name}</b><br />{r.error ? r.error : <code dir="ltr">{r.key}</code>}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
