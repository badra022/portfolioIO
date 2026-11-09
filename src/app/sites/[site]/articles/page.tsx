import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/server/site";
import { articleCards } from "@/lib/library";
import { ui, tf } from "@/lib/i18n";
import { LibraryShell } from "@/components/LibraryShell";
import { LibraryList } from "@/components/LibraryList";

type Props = PageProps<"/sites/[site]/articles">;

async function load(params: Props["params"]) {
  const data = await getSiteData(decodeURIComponent((await params).site));
  return data.kind === "tenant" && data.permissions.library ? data : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(params);
  if (!data) return { robots: { index: false, follow: false } };
  const t = ui(data.content.locale);
  const url = data.canonical ? `${data.canonical}/articles` : undefined;
  return {
    title: `${t.libArticles} | ${data.content.profile.fullTitle}`,
    description: `${t.libArticlesIntro} · ${data.content.profile.fullTitle}`,
    robots: data.indexable ? { index: true, follow: true } : { index: false, follow: data.env === "production" },
    alternates: url ? { canonical: url } : undefined,
    openGraph: { title: `${t.libArticles} | ${data.content.profile.fullTitle}`, url, type: "website" },
  };
}

/** Every published article of the teacher, grouped, searchable (lib/library.ts, components/LibraryList.tsx). */
export default function ArticlesPage({ params }: Props) {
  return <Suspense fallback={null}><Body params={params} /></Suspense>;
}

async function Body({ params }: { params: Props["params"] }) {
  const data = await load(params);
  if (!data) notFound();
  const c = data.content;
  const t = ui(c.locale);
  const cards = articleCards(c, data.base, Infinity);
  return (
    <LibraryShell c={c} base={data.base} title={t.libArticles} intro={`${t.libArticlesIntro} · ${tf(t.libCountArticles, { n: cards.length })}`}>
      <LibraryList kind="articles" cards={cards} base={data.base} locale={c.locale} />
    </LibraryShell>
  );
}
