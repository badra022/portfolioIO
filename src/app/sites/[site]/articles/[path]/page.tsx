import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/server/site";
import { articleCards, articleSummary, liveArticle } from "@/lib/library";
import { ui, tf } from "@/lib/i18n";
import { chatConfig } from "@/lib/chat";
import { youtubeId } from "@/lib/youtube";
import { dateParts } from "@/lib/format";
import { jsonLdScript } from "@/lib/structured-data";
import { instantOf } from "@/lib/dates";
import { LibraryShell } from "@/components/LibraryShell";
import { ActionButton } from "@/components/ActionButton";
import { LeadForms } from "@/components/LeadForms";
import { PageVisit } from "@/components/PageVisit";
import { YoutubeVideo } from "@/components/YoutubeVideo";
import { Icon } from "@/components/Icon";
import { ItemViews, ShareButton } from "@/components/LibraryBits";

type Props = PageProps<"/sites/[site]/articles/[path]">;
const VIDEO_FILE = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

async function load(params: Props["params"]) {
  const { site, path } = await params;
  const data = await getSiteData(decodeURIComponent(site));
  if (data.kind !== "tenant" || !data.permissions.library) return null;
  const article = liveArticle(data.content, decodeURIComponent(path), Infinity);
  return article ? { data, article } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load(params);
  if (!r) return { robots: { index: false, follow: false } };
  const { data, article } = r;
  const url = data.canonical ? `${data.canonical}/articles/${article.path}` : undefined;
  const index = article.indexable && data.indexable;
  return {
    title: `${article.title} | ${data.content.profile.fullTitle}`,
    description: articleSummary(article),
    robots: index ? { index: true, follow: true } : { index: false, follow: data.env === "production" },
    alternates: url ? { canonical: url } : undefined,
    openGraph: { title: article.title, description: articleSummary(article), url, type: "article", images: article.image ? [article.image] : undefined },
  };
}

/** One article (lib/schema.ts Article): cover, its blocks, an optional button, and more from the same group. */
export default function ArticlePage({ params }: Props) {
  return <Suspense fallback={null}><Body params={params} /></Suspense>;
}

async function Body({ params }: { params: Props["params"] }) {
  const r = await load(params);
  if (!r) notFound();
  const { data, article: a } = r;
  const c = data.content;
  const t = ui(c.locale);
  const chat = chatConfig(c);
  const href = `${data.base}/articles/${a.path}`;
  const words = a.blocks.reduce((n, b) => n + (b.text ?? "").split(/\s+/).filter(Boolean).length, 0);
  const related = a.group ? articleCards(c, data.base, Infinity).filter((x) => x.group === a.group?.trim() && x.path !== a.path).slice(0, 3) : [];
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: articleSummary(a),
    ...(a.image ? { image: [a.image] } : {}),
    ...(a.publishAt ? { datePublished: instantOf(a.publishAt).toISOString() } : {}),
    author: { "@type": "Person", name: c.profile.fullTitle, ...(data.canonical ? { url: `${data.canonical}/` } : {}) },
    ...(data.canonical ? { mainEntityOfPage: `${data.canonical}/articles/${a.path}` } : {}),
    inLanguage: c.locale,
  };
  return (
    <LibraryShell c={c} base={data.base} back={{ href: `${data.base}/articles`, label: t.libAllArticles }}>
      <article className="lib-article">
        {a.image && <img className="lib-cover" src={a.image} alt="" />}
        {(a.group || a.tags.length > 0) && (
          <div className="lib-chips-row">
            {a.group && <span className="lib-chip strong">{a.group}</span>}
            {a.tags.filter((x) => x.trim()).map((x) => <span key={x} className="lib-tag">#{x}</span>)}
          </div>
        )}
        <h1>{a.title}</h1>
        <div className="lib-meta">
          {c.library.showViews && a.showViews && <ItemViews base={data.base} kind="article" path={a.path} />}
          {a.publishAt && <span className="num">{dateParts(a.publishAt, c.locale).short}</span>}
          {words > 0 && <span className="num">{tf(t.libReading, { n: Math.max(1, Math.round(words / 180)) })}</span>}
          <ShareButton href={href} title={a.title} />
        </div>
        <div className="lib-body">
          {a.blocks.map((b, i) => {
            if (b.type === "heading" && b.text) return <h2 key={i}>{b.text}</h2>;
            if (b.type === "paragraph" && b.text) return <p key={i}>{b.text}</p>;
            if (b.type === "image" && b.image) return <figure key={i}><img src={b.image} alt={b.caption ?? ""} loading="lazy" />{b.caption && <figcaption>{b.caption}</figcaption>}</figure>;
            if (b.type === "video" && b.url) {
              const yt = youtubeId(b.url);
              return (
                <figure key={i} className="lib-video">
                  {yt ? <YoutubeVideo id={yt} title={b.caption || a.title} bare />
                    : VIDEO_FILE.test(b.url) ? <video src={b.url} controls playsInline preload="metadata" />
                    : <a className="btn btn-ghost" href={b.url} target="_blank" rel="noopener noreferrer"><Icon name="play" />{t.pageVideo}</a>}
                  {b.caption && <figcaption>{b.caption}</figcaption>}
                </figure>
              );
            }
            if (b.type === "file" && b.url) return <p key={i}><a className="btn btn-ghost lib-file" href={b.url} target="_blank" rel="noopener noreferrer"><Icon name="file" />{b.label || t.libOpenFile}</a></p>;
            return null;
          })}
        </div>
        {a.cta && <div className="lib-cta"><ActionButton action={a.cta} chat={chat} block /></div>}
      </article>
      {related.length > 0 && (
        <section className="lib-related">
          <h2>{tf(t.libReadMore, { group: a.group ?? "" })}</h2>
          {related.map((x) => (
            <a key={x.key} className="lib-mini" href={x.href}>
              <span className={`lib-thumb${x.image ? "" : " none"}`}>{x.image ? <img src={x.image} alt="" loading="lazy" /> : <Icon name="book" />}</span>
              <span><b>{x.title}</b>{x.summary && <small>{x.summary}</small>}</span>
            </a>
          ))}
        </section>
      )}
      {a.cta?.form && <LeadForms forms={c.forms} slug={data.slug} base={data.base} />}
      {data.env === "production" && <PageVisit base={data.base} path={`a:${a.path}`} />}
      {data.env === "production" && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld as never) }} />}
    </LibraryShell>
  );
}
