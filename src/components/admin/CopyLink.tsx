"use client";
import { useEffect, useState } from "react";

/** The full link of a page of the site, with a copy button (to paste in a story or a group). */
export function CopyLink({ path }: { path: string }) {
  const [url, setUrl] = useState(path);
  const [done, setDone] = useState(false);
  useEffect(() => { setUrl(`${location.origin}${path}`); }, [path]);
  return (
    <span className="cl">
      <a dir="ltr" href={url} target="_blank" rel="noopener">{url.replace(/^https?:\/\//, "")}</a>
      <button type="button" className="btn-sm primary" onClick={async () => {
        try { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* blocked */ }
      }}>{done ? "اتنسخ ✓" : "نسخ الرابط"}</button>
    </span>
  );
}
