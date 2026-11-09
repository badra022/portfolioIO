"use client";
import { useEffect, useRef, useState } from "react";
import type { LeadFormT } from "@/lib/schema";
import { CONVERT_EVENT } from "@/lib/analytics";
import { remembers } from "@/lib/lead";
import { currentRef } from "@/lib/referral";
import { FormFields, checkFields } from "./FormFields";
import { Icon } from "./Icon";
import { IGNORE_KEY } from "./Tracker";
import { useUI } from "./UIText";

/**
 * A game on its page (lib/schema.ts Game): the teacher's form first when there is one
 * (answers go to «الطلبات» like any form; remembered fields are filled in), then the game
 * in a sandboxed frame with an opaque origin: it can't reach the site's cookies, storage
 * or admin session (app/sites/[site]/games/[path]/play sends the same sandbox as a header).
 */
export function GamePlayer({ slug, base, path, title, playLabel, form, preview }: {
  slug: string;
  base: string;
  path: string;
  title: string;
  playLabel: string;
  form: LeadFormT | null;
  preview: boolean;
}) {
  const t = useUI();
  const memKey = `lf:${slug}`;
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!form) return;
    try {
      const known = JSON.parse(localStorage.getItem(memKey) ?? "{}") ?? {};
      setValues(Object.fromEntries(form.fields.filter(remembers).map((f) => [f.id, known[f.id] ?? ""]).filter(([, v]) => v)));
    } catch { /* storage blocked */ }
  }, [form, memKey]);

  const start = () => {
    setPlaying(true);
    if (preview) return;
    try { if (localStorage.getItem(IGNORE_KEY) === "1") return; } catch { /* storage blocked */ }
    const body = JSON.stringify({ e: [{ t: "page", p: `gp:${path}` }] });
    if (!navigator.sendBeacon?.(`${base}/api/v`, body)) void fetch(`${base}/api/v`, { method: "POST", body, keepalive: true }).catch(() => {});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return start();
    const answers = Object.fromEntries(form.fields.map((f) => [f.id, (values[f.id] ?? "").trim()]));
    const problems = checkFields(form.fields, answers, t);
    if (Object.keys(problems).length) { setErrors(problems); return; }
    setBusy(true);
    try {
      const res = await fetch(`${base}/api/f`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ form: form.id, source: title, place: "game", values: answers, context: { game: title }, ref: currentRef(slug) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 422 && data.errors) { setErrors(data.errors); return; }
      if (!res.ok) { setErrors({ _: data.error ?? t.error }); return; }
      try {
        const keep = JSON.parse(localStorage.getItem(memKey) ?? "{}") ?? {};
        for (const f of form.fields) if (remembers(f) && answers[f.id]) keep[f.id] = answers[f.id];
        localStorage.setItem(memKey, JSON.stringify(keep));
      } catch { /* storage blocked */ }
      window.dispatchEvent(new CustomEvent(CONVERT_EVENT, { detail: { ch: "form", at: "game" } }));
      setErrors({});
      start();
    } catch {
      setErrors({ _: t.offline });
    } finally {
      setBusy(false);
    }
  };

  if (playing) {
    return (
      <div className="game-stage">
        <iframe ref={frame} src={`${base}/games/${path}/play`} title={title}
          sandbox="allow-scripts allow-pointer-lock" allow="fullscreen; autoplay" referrerPolicy="no-referrer" />
        <button type="button" className="btn btn-ghost game-full" onClick={() => void frame.current?.requestFullscreen?.().catch(() => {})}>
          <Icon name="expand" />{t.libFullscreen}
        </button>
      </div>
    );
  }
  return (
    <form className="game-gate lead-form" onSubmit={submit} noValidate>
      {form && form.fields.length > 0 && <p className="game-gate-title">{t.libBeforePlay}</p>}
      {form && <FormFields fields={form.fields} values={values} errors={errors} onChange={(id, v) => setValues((x) => ({ ...x, [id]: v }))} idPrefix="game" />}
      {errors._ && <p className="lead-err" role="alert">{errors._}</p>}
      <button type="submit" className="btn btn-wa btn-block" disabled={busy}><Icon name="game" />{playLabel || t.libPlay}</button>
    </form>
  );
}
