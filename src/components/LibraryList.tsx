"use client";
import { useMemo, useState } from "react";
import type { LibraryCard, LibraryKind } from "@/lib/library";
import { groupsOf } from "@/lib/library";
import { matches } from "@/lib/search";
import { dateParts } from "@/lib/format";
import { Icon } from "./Icon";
import { Marked, ShareButton, Views, useCounts } from "./LibraryBits";
import { useUI } from "./UIText";

/**
 * The list on /articles and /games: a search box with suggestions as you type
 * (forgiving with Arabic letters, lib/search.ts), the teacher's groups as filter
 * buttons and headings, and a card per item with its image, the start of its text,
 * views (read fresh, app/sites/[site]/api/views) and a share button.
 */
export function LibraryList({ kind, cards, base, locale }: { kind: LibraryKind; cards: LibraryCard[]; base: string; locale: string }) {
  const t = useUI();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const counts = useCounts(base, `kind=${kind}`);

  const found = useMemo(() => cards.filter((c) => matches(q, c.title, c.summary, c.tags.join(" "), c.group)), [cards, q]);
  const shown = group === null ? found : found.filter((c) => (c.group ?? "") === group);
  const groups = groupsOf(shown, t.libOther);
  const names = [...new Set(cards.map((c) => c.group ?? ""))];
  const hasGroups = names.some(Boolean) && names.length > 1;
  const suggest = q.trim() && focus ? found.slice(0, 5) : [];
  const place = kind === "articles" ? t.libSearchArticles : t.libSearchGames;

  if (!cards.length) return <p className="lib-empty">{t.libEmpty}</p>;
  return (
    <div className="lib">
      <div className="lib-search" role="search">
        <label className="lib-box">
          <Icon name="search" />
          <span className="sr-only">{t.libSearchLabel}</span>
          <input type="search" value={q} placeholder={place} autoComplete="off" enterKeyHint="search"
            onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} />
          {q && <button type="button" className="lib-clear" onClick={() => setQ("")} aria-label={t.libClear}><Icon name="close" /></button>}
        </label>
        {suggest.length > 0 && (
          <ul className="lib-suggest" role="listbox">
            {suggest.map((c) => (
              <li key={c.key} role="option" aria-selected="false">
                <a href={c.href}>
                  <b><Marked text={c.title} query={q} /></b>
                  {c.group && <small>{c.group}</small>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasGroups && (
        <div className="lib-chips" role="group">
          <button type="button" className={group === null ? "on" : undefined} aria-pressed={group === null} onClick={() => setGroup(null)}>{t.libAll}</button>
          {names.filter(Boolean).map((g) => (
            <button key={g} type="button" className={group === g ? "on" : undefined} aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>
          ))}
          {names.includes("") && <button type="button" className={group === "" ? "on" : undefined} aria-pressed={group === ""} onClick={() => setGroup("")}>{t.libOther}</button>}
        </div>
      )}

      {shown.length === 0 && <p className="lib-empty">{t.libNone}</p>}
      {groups.map((g) => (
        <section key={g.name || "_"} className="lib-group">
          {g.name && <h2 className="lib-group-head"><span>{g.name}</span><small className="num">{g.items.length}</small></h2>}
          <div className="lib-cards">
            {g.items.map((c) => (
              <article key={c.key} className="lib-card">
                <a className="lib-card-link" href={c.href} aria-label={c.title} />
                <div className={`lib-thumb${c.image ? "" : " none"}`}>
                  {c.image ? <img src={c.image} alt="" loading="lazy" decoding="async" /> : <Icon name={kind === "articles" ? "book" : "game"} />}
                </div>
                <div className="lib-card-body">
                  <h3><Marked text={c.title} query={q} /></h3>
                  {c.summary && <p><Marked text={c.summary} query={q} /></p>}
                  <div className="lib-meta">
                    {c.showViews && <Views n={counts ? counts[c.key] ?? 0 : undefined} />}
                    {c.date && <span className="num">{dateParts(c.date, locale).short}</span>}
                    {c.tags.slice(0, 3).map((tag) => <span key={tag} className="lib-tag">#<Marked text={tag} query={q} /></span>)}
                    <ShareButton href={c.href} title={c.title} compact />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
