"use client";
import { useEffect, useMemo, useState } from "react";
import { pollStatus, pollTimes, type PollStatus } from "@/lib/poll";
import { Carousel } from "./Carousel";
import { Icon } from "./Icon";

export type PollSummary = {
  path: string;
  title: string;
  description?: string;
  images: string[];
  choices: { label: string; image?: string }[];
  state: "auto" | "open" | "closed";
  startsAt?: string;
  durationHours: number;
  submitLabel: string;
  doneMessage: string;
  showResults: boolean;
};

type Results = { counts: number[]; total: number } | null;

const two = (n: number) => String(n).padStart(2, "0");

/** "باقي 3 ساعات 12 دقيقة 05 ثانية" as boxes: the vote's own deadline, the same for everyone. */
function Countdown({ left }: { left: number }) {
  const s = Math.max(0, Math.floor(left / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const parts = [...(d > 0 ? [[String(d), "يوم"]] : []), [two(h), "ساعة"], [two(m), "دقيقة"], [two(sec), "ثانية"]];
  return (
    <div className="pl-timer" role="timer" aria-live="off">
      <span className="pl-timer-lbl">باقي على نهاية التصويت</span>
      <div className="pl-timer-boxes" dir="ltr">
        {parts.map(([v, l]) => <span key={l}><b className="num">{v}</b><small>{l}</small></span>)}
      </div>
    </div>
  );
}

/**
 * An anonymous vote (lib/schema.ts Poll): pick a choice and send. Nothing about the
 * student is asked. The countdown uses the server's clock, so it shows the same
 * time left on every phone; when it reaches zero the vote closes.
 */
export function PollApp({ base, poll }: { base: string; poll: PollSummary }) {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [voted, setVoted] = useState(false);
  const [results, setResults] = useState<Results>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const api = (body: object) => fetch(`${base}/api/poll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ poll: poll.path, ...body }) })
    .then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

  useEffect(() => {
    let off = 0;
    api({ op: "status" }).then(({ data }) => {
      if (typeof data.now === "number") { off = data.now - Date.now(); setOffset(off); }
      if (data.voted) { setVoted(true); setResults(data.results ?? null); }
    }).catch(() => { /* offline: the phone's clock */ });
    const tick = () => setNow(Date.now() + off);
    tick();
    const id = setInterval(() => setNow(Date.now() + off), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setNow(Date.now() + offset); }, [offset]);

  const status: PollStatus | null = useMemo(() => (now === null ? null : pollStatus(poll, now)), [poll, now]);
  const end = pollTimes(poll).end;
  const left = status?.open && poll.state === "auto" && end !== null && now !== null ? end - now : null;

  const send = async () => {
    if (choice === null) return;
    setBusy(true); setError("");
    try {
      const { status: code, data } = await api({ op: "vote", choice });
      if (data.ok || data.error === "voted") { setVoted(true); setResults(data.results ?? null); return; }
      setError(code === 409 ? "التصويت مقفول دلوقتي." : "حصلت مشكلة، حاول تاني.");
    } catch {
      setError("مفيش اتصال بالإنترنت؟ حاول تاني.");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const url = location.href;
    try {
      if (navigator.share) { await navigator.share({ title: poll.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* closed the share sheet */ }
  };

  const closedText = status && !status.open
    ? status.reason === "notYet" ? "التصويت لسه مبدأش. ارجع تاني قريب." : "التصويت انتهى. شكراً لكل اللي شاركوا!"
    : null;

  return (
    <article className="pl-card">
      {poll.images.length === 1 && <img className="pl-cover" src={poll.images[0]} alt="" />}
      {poll.images.length > 1 && (
        <Carousel display="carousel" className="pl-gallery" per={1} label={poll.title}>
          {poll.images.map((src, i) => <img key={i} className="pl-cover" src={src} alt="" />)}
        </Carousel>
      )}
      <span className="pl-tag"><Icon name="chat" />تصويت · من غير اسم ولا رقم</span>
      <h1>{poll.title}</h1>
      {poll.description && <p className="pl-desc">{poll.description}</p>}
      {left !== null && left > 0 && !voted && <Countdown left={left} />}

      {voted ? (
        <div className="pl-done" role="status">
          <b><Icon name="check" />{poll.doneMessage}</b>
          {results && results.total > 0 && (
            <ul className="pl-results">
              {poll.choices.map((c, i) => {
                const pct = Math.round((results.counts[i] / results.total) * 100);
                return (
                  <li key={i} className={i === choice ? "mine" : ""}>
                    <span className="pl-r-top"><span>{c.label}</span><b className="num">{pct}%</b></span>
                    <span className="pl-bar"><i style={{ inlineSize: `${pct}%` }} /></span>
                  </li>
                );
              })}
            </ul>
          )}
          {results && <small className="pl-total">{results.total} صوت لحد دلوقتي</small>}
        </div>
      ) : closedText ? (
        <p className="pl-closed" role="status">{closedText}</p>
      ) : (
        <>
          <fieldset className={`pl-choices${poll.choices.some((c) => c.image) ? " with-img" : ""}`}>
            <legend className="sr-only">{poll.title}</legend>
            {poll.choices.map((c, i) => (
              <label key={i} className={`pl-choice${choice === i ? " on" : ""}`}>
                <input type="radio" name="choice" checked={choice === i} onChange={() => setChoice(i)} />
                {c.image && <img src={c.image} alt="" loading="lazy" />}
                <span className="pl-lbl"><i aria-hidden="true" />{c.label}</span>
              </label>
            ))}
          </fieldset>
          {error && <p className="lead-err" role="alert">{error}</p>}
          <button type="button" className="btn btn-wa btn-block" disabled={choice === null || busy || !status?.open} onClick={send}>
            <Icon name="check" />{busy ? "جاري الإرسال…" : poll.submitLabel}
          </button>
        </>
      )}
      <button type="button" className="btn btn-ghost btn-sm pl-share" onClick={share}><Icon name="link" />{copied ? "اتنسخ الرابط" : "شارك التصويت"}</button>
    </article>
  );
}
