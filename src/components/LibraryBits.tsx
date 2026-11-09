"use client";
import { useEffect, useState } from "react";
import { matchRanges } from "@/lib/search";
import { shareUrl, type LibraryLink } from "@/lib/library";
import { tf } from "@/lib/i18n";
import { Icon } from "./Icon";
import { useUI } from "./UIText";

/**
 * Small pieces of the content library's pages (/articles, /games, /exams).
 */

/** Shares an item's link (+ ?via=share): the phone's share sheet, or copies it. */
export function ShareButton({ href, title, compact }: { href: string; title: string; compact?: boolean }) {
  const t = useUI();
  const [copied, setCopied] = useState(false);
  const share = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = shareUrl(location.origin, href);
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* no clipboard */ }
  };
  return (
    <button type="button" className={`lib-share${compact ? " compact" : ""}`} onClick={share} aria-label={`${t.libShare}: ${title}`}>
      <Icon name="share" />{!compact && <span>{copied ? t.libCopied : t.libShare}</span>}
      {compact && copied && <span className="lib-toast" role="status">{t.libCopied}</span>}
    </button>
  );
}

/** Text with the searched words marked (letters compared loosely, lib/search.ts). */
export function Marked({ text, query }: { text: string; query: string }) {
  const src = text.normalize("NFC");
  const ranges = query.trim() ? matchRanges(src, query) : [];
  if (!ranges.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a > at) out.push(src.slice(at, a));
    out.push(<mark key={i}>{src.slice(a, b)}</mark>);
    at = b;
  });
  if (at < src.length) out.push(src.slice(at));
  return <>{out}</>;
}

/** A views count with the eye icon. */
export function Views({ n }: { n: number | undefined }) {
  const t = useUI();
  if (n === undefined) return null;
  return <span className="lib-views" title={t.libViews}><Icon name="eye" /><span className="num">{n.toLocaleString("en-US")}</span><span className="sr-only">{t.libViews}</span></span>;
}

/** Counts for a list page, read fresh on every load (app/sites/[site]/api/views). */
export function useCounts(base: string, query: string): Record<string, number> | null {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${base}/api/views?${query}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { counts: {} }))
      .then((d) => { if (live) setCounts(d.counts ?? {}); })
      .catch(() => { if (live) setCounts({}); });
    return () => { live = false; };
  }, [base, query]);
  return counts;
}


/** One article's or game's views, read fresh (its page stays cached). */
export function ItemViews({ base, kind, path }: { base: string; kind: "article" | "game"; path: string }) {
  const t = useUI();
  const counts = useCounts(base, `kind=${kind}&path=${encodeURIComponent(path)}`);
  if (!counts) return null;
  const n = counts[`${kind === "article" ? "a" : "g"}:${path}`] ?? 0;
  return <span className="lib-views"><Icon name="eye" /><span className="num">{tf(t.libViewsN, { n: n.toLocaleString("en-US") })}</span></span>;
}

/**
 * Links to the library's pages, in the sections menu and above the footer. On a
 * computer they open in a new tab; on a phone in the same one (the pages have a way back).
 */
export function LibraryLinks({ links, variant }: { links: LibraryLink[]; variant: "menu" | "strip" }) {
  const t = useUI();
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(min-width: 1100px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  if (!links.length) return null;
  const label = { articles: t.libArticles, exams: t.libExams, games: t.libGames };
  const icon = { articles: "book", exams: "check", games: "game" };
  const note = (l: LibraryLink) => (l.id === "articles" ? tf(t.libCountArticles, { n: l.count }) : l.id === "games" ? tf(t.libCountGames, { n: l.count }) : l.count ? tf(t.libCountOpen, { n: l.count }) : "");
  return (
    <div className={`lib-links ${variant}`}>
      <span className="lib-links-title">{t.libOtherPages}</span>
      <div className="lib-links-list">
        {links.map((l) => (
          <a key={l.id} href={l.href} target={wide ? "_blank" : undefined} rel={wide ? "noopener" : undefined}>
            <span className="lib-links-ic"><Icon name={icon[l.id]} /></span>
            <span className="lib-links-text"><b>{label[l.id]}</b>{note(l) && <small>{note(l)}</small>}</span>
            <Icon name="external" className="lib-links-go" />
          </a>
        ))}
      </div>
    </div>
  );
}
