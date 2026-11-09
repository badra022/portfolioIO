import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/server/site";
import { examEntries, type ExamTab } from "@/lib/library";
import { ui } from "@/lib/i18n";
import { chatConfig } from "@/lib/chat";
import { LibraryShell } from "@/components/LibraryShell";
import { ExamsList } from "@/components/ExamsList";
import { LeadForms } from "@/components/LeadForms";
import { contactIds } from "@/components/TenantPage";

type Props = PageProps<"/sites/[site]/exams">;

async function load(params: Props["params"]) {
  const data = await getSiteData(decodeURIComponent((await params).site));
  return data.kind === "tenant" && data.permissions.library ? data : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(params);
  if (!data) return { robots: { index: false, follow: false } };
  const t = ui(data.content.locale);
  const url = data.canonical ? `${data.canonical}/exams` : undefined;
  return {
    title: `${t.libExams} | ${data.content.profile.fullTitle}`,
    description: `${t.libExamsIntro} · ${data.content.profile.fullTitle}`,
    robots: data.indexable ? { index: true, follow: true } : { index: false, follow: data.env === "production" },
    alternates: url ? { canonical: url } : undefined,
    openGraph: { title: `${t.libExams} | ${data.content.profile.fullTitle}`, url, type: "website" },
  };
}

/**
 * Every exam of the teacher (lib/library.ts examEntries): online quizzes open now,
 * coming soon or finished, center exams to book, and published results to look up.
 */
export default function ExamsPage(props: Props) {
  return <Suspense fallback={null}><Body {...props} /></Suspense>;
}

async function Body({ params, searchParams }: Props) {
  // Which tab a quiz is on depends on the time of the request.
  await connection();
  const data = await load(params);
  if (!data) notFound();
  const c = data.content;
  const t = ui(c.locale);
  const tab = (await searchParams).tab;
  const entries = examEntries(c, data.base, data.pastExams);
  const exams = Object.fromEntries((c.exams?.items ?? []).map((e) => [e.id, e]));
  return (
    <LibraryShell c={c} base={data.base} title={t.libExams} intro={t.libExamsIntro}>
      <ExamsList
        entries={entries} base={data.base} slug={data.slug} locale={c.locale}
        exams={exams} labels={c.exams?.labels ?? null} chat={chatConfig(c)} {...contactIds(c)}
        initialTab={tab === "live" || tab === "soon" || tab === "closed" ? (tab as ExamTab) : null}
      />
      {(c.exams?.items ?? []).some((e) => e.form) && <LeadForms forms={c.forms} slug={data.slug} base={data.base} />}
    </LibraryShell>
  );
}
