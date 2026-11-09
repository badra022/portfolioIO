import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/server/site";
import { liveGame } from "@/lib/library";
import { ui } from "@/lib/i18n";
import { chatConfig } from "@/lib/chat";
import { LibraryShell } from "@/components/LibraryShell";
import { ActionButton } from "@/components/ActionButton";
import { LeadForms } from "@/components/LeadForms";
import { PageVisit } from "@/components/PageVisit";
import { GamePlayer } from "@/components/GamePlayer";
import { ItemViews, ShareButton } from "@/components/LibraryBits";

type Props = PageProps<"/sites/[site]/games/[path]">;

async function load(params: Props["params"]) {
  const { site, path } = await params;
  const data = await getSiteData(decodeURIComponent(site));
  if (data.kind !== "tenant" || !data.permissions.library) return null;
  const game = liveGame(data.content, decodeURIComponent(path), Infinity);
  return game ? { data, game } : null;
}

const firstLine = (s?: string) => (s ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load(params);
  if (!r) return { robots: { index: false, follow: false } };
  const { data, game } = r;
  const url = data.canonical ? `${data.canonical}/games/${game.path}` : undefined;
  const index = game.indexable && data.indexable;
  return {
    title: `${game.title} | ${data.content.profile.fullTitle}`,
    description: firstLine(game.description) || undefined,
    robots: index ? { index: true, follow: true } : { index: false, follow: data.env === "production" },
    alternates: url ? { canonical: url } : undefined,
    openGraph: { title: game.title, description: firstLine(game.description) || undefined, url, type: "website", images: game.image ? [game.image] : undefined },
  };
}

/** One learning game (lib/schema.ts Game): its text, the form before playing, the sandboxed game, a button under it. */
export default function GamePage({ params }: Props) {
  return <Suspense fallback={null}><Body params={params} /></Suspense>;
}

async function Body({ params }: { params: Props["params"] }) {
  const r = await load(params);
  if (!r) notFound();
  const { data, game: g } = r;
  const c = data.content;
  const t = ui(c.locale);
  const href = `${data.base}/games/${g.path}`;
  const form = g.form ? c.forms.find((f) => f.id === g.form) ?? null : null;
  return (
    <LibraryShell c={c} base={data.base} back={{ href: `${data.base}/games`, label: t.libAllGames }} wide>
      <article className="lib-article lib-game">
        <div className="lib-game-head">
          {g.image && <img className="lib-game-cover" src={g.image} alt="" />}
          <div>
            {(g.group || g.tags.length > 0) && (
              <div className="lib-chips-row">
                {g.group && <span className="lib-chip strong">{g.group}</span>}
                {g.tags.filter((x) => x.trim()).map((x) => <span key={x} className="lib-tag">#{x}</span>)}
              </div>
            )}
            <h1>{g.title}</h1>
            <div className="lib-meta">
              {c.library.showViews && g.showViews && <ItemViews base={data.base} kind="game" path={g.path} />}
              <ShareButton href={href} title={g.title} />
            </div>
          </div>
        </div>
        {g.description && <div className="lib-body">{g.description.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>}
        {g.file ? <GamePlayer slug={data.slug} base={data.base} path={g.path} title={g.title} playLabel={g.playLabel} form={form} preview={data.env === "preview"} />
          : <p className="lib-empty">{t.libEmpty}</p>}
        {g.cta && <div className="lib-cta"><ActionButton action={g.cta} chat={chatConfig(c)} block /></div>}
      </article>
      {(g.cta?.form) && <LeadForms forms={c.forms} slug={data.slug} base={data.base} />}
      {data.env === "production" && <PageVisit base={data.base} path={`g:${g.path}`} />}
    </LibraryShell>
  );
}
