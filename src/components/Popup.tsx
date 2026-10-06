"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { deadline } from "@/lib/dates";
import { youtubeId } from "@/lib/youtube";
import { ActionButton } from "./ActionButton";
import { Icon } from "./Icon";
import { YoutubeVideo } from "./YoutubeVideo";

type Data = NonNullable<Content["popup"]>;

/**
 * Announcement shown shortly after the page opens: a centered card on tablets and
 * desktops, a bottom sheet on phones (the page stays visible and usable above it).
 * Closing is remembered on the device for `remindAfterHours`; editing the
 * announcement gives it a new storage key, so everyone sees the new version.
 */
export function Popup({ data, chat, storageKey, closeLabel }: { data: Data; chat: ChatConfig; storageKey: string; closeLabel: string }) {
  const [open, setOpen] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (data.endsAt && Date.now() >= deadline(data.endsAt).getTime()) return;
    let closedAt = 0;
    try { closedAt = Number(localStorage.getItem(storageKey)) || 0; } catch { /* storage blocked: show it */ }
    if (closedAt && Date.now() - closedAt < data.remindAfterHours * 3_600_000) return;
    const t = setTimeout(() => setOpen(true), data.delaySeconds * 1000);
    return () => clearTimeout(t);
  }, [data.endsAt, data.delaySeconds, data.remindAfterHours, storageKey]);

  const close = useCallback(() => {
    setOpen(false);
    try { localStorage.setItem(storageKey, String(Date.now())); } catch { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;
  const vid = data.video ? youtubeId(data.video) : null;
  return (
    <div className="pop-layer" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="pop" role="dialog" aria-modal="false" aria-labelledby="pop-title">
        <span className="pop-grip" aria-hidden="true" />
        <button ref={closeBtn} type="button" className="pop-close" aria-label={closeLabel} onClick={close}>
          <Icon name="close" />
        </button>
        {vid ? (
          <div className="pop-media"><YoutubeVideo id={vid} title={data.title} bare /></div>
        ) : data.image ? (
          <img className="pop-img" src={data.image} alt="" />
        ) : null}
        <div className="pop-body">
          <h2 id="pop-title">{data.title}</h2>
          {data.text && <p>{data.text}</p>}
          {data.cta && <ActionButton action={data.cta} chat={chat} block />}
        </div>
      </div>
    </div>
  );
}
