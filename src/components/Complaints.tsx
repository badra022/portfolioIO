"use client";

import { useState } from "react";
import type { Content } from "@/lib/schema";
import { useUI } from "./UIText";

/**
 * The anonymous complaints and suggestions box. Sends only the message and its
 * topic to api/c: no name, phone, referral or tracking, and nothing is remembered
 * on the device.
 */
export function Complaints({ data, base }: { data: Content["complaints"]; base: string }) {
  const t = useUI();
  const d = data ?? { categories: [] };
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 5) { setError(t.complaintsShort); return; }
    setState("busy");
    setError("");
    try {
      const res = await fetch(`${base}/api/c`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, topic: topic || undefined, website }),
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || !r.ok) { setError(r.error || t.error); setState("idle"); return; }
      setState("sent");
      setMessage("");
      setTopic("");
    } catch {
      setError(t.offline);
      setState("idle");
    }
  }

  return (
    <section className="block" id="complaints">
      <div className="wrap cp-wrap">
        <div className="sec-head">
          <span className="eyebrow">{d.eyebrow || t.complaintsEyebrow}</span>
          <h2>{d.title || t.complaintsTitle}</h2>
          <p>{d.intro || t.complaintsIntro}</p>
        </div>
        {state === "sent" ? (
          <div className="cp-box cp-done" role="status">
            <span className="cp-ok" aria-hidden="true">✓</span>
            <p>{d.thanks || t.complaintsThanks}</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setState("idle")}>{t.complaintsAnother}</button>
          </div>
        ) : (
          <form className="cp-box" onSubmit={send} noValidate>
            {d.categories.length > 0 && (
              <div className="cp-topics" role="group" aria-label={t.complaintsTopic}>
                <span>{t.complaintsTopic}</span>
                {d.categories.map((c) => (
                  <button key={c} type="button" className="chip" aria-pressed={topic === c} onClick={() => setTopic(topic === c ? "" : c)}>{c}</button>
                ))}
              </div>
            )}
            <textarea
              aria-label={d.title || t.complaintsTitle}
              value={message}
              onChange={(e) => { setMessage(e.target.value); if (error) setError(""); }}
              placeholder={d.placeholder || t.complaintsPlaceholder}
              maxLength={2000}
              rows={5}
              autoComplete="off"
            />
            {/* Honeypot: hidden from people, bots fill it. */}
            <input className="cp-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
            {error && <p className="cp-err" role="alert">{error}</p>}
            <button type="submit" className="btn btn-wa btn-block" disabled={state === "busy"}>
              {state === "busy" ? t.sending : d.button || t.complaintsSend}
            </button>
            <p className="cp-anon"><span aria-hidden="true">🔒</span> {t.complaintsAnon}</p>
          </form>
        )}
      </div>
    </section>
  );
}
