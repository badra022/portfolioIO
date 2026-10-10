import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/server/site";
import { QuizApp, type QuizSummary } from "@/components/QuizApp";

type Props = PageProps<"/sites/[site]/[quiz]">;

async function load(params: Props["params"]) {
  const { site, quiz: raw } = await params;
  const data = await getSiteData(decodeURIComponent(site));
  if (data.kind !== "tenant") return null;
  const quiz = data.content.quizzes.find((q) => q.path === decodeURIComponent(raw));
  return quiz ? { data, quiz } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load(params);
  if (!r) return { robots: { index: false, follow: false } };
  const { data, quiz } = r;
  // Indexed only when the teacher switched it on, and only on the main address (like the home page).
  const index = quiz.indexable && data.indexable;
  const url = data.canonical ? `${data.canonical}/${quiz.path}` : undefined;
  return {
    title: `${quiz.title} | ${data.content.profile.fullTitle}`,
    description: quiz.intro,
    robots: index ? { index: true, follow: true } : { index: false, follow: data.env === "production" },
    alternates: url ? { canonical: url } : undefined,
    openGraph: { title: quiz.title, description: quiz.intro, url, type: "website", images: quiz.image ? [quiz.image] : undefined },
  };
}

/** A teacher's quiz on its own page: teacher.com/<path> (lib/schema.ts Quiz). */
export default function QuizPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Props["params"] }) {
  const r = await load(params);
  if (!r) notFound();
  const { data, quiz } = r;
  const c = data.content;
  // Questions and the answer key stay on the server until a student starts.
  const summary: QuizSummary = {
    path: quiz.path, title: quiz.title, intro: quiz.intro, image: quiz.image, durationMinutes: quiz.durationMinutes,
    state: quiz.state, startsAt: quiz.startsAt, endsAt: quiz.endsAt, startLabel: quiz.startLabel, submitLabel: quiz.submitLabel,
    doneMessage: quiz.doneMessage, count: quiz.questions.length,
  };
  const form = quiz.form ? c.forms.find((f) => f.id === quiz.form) ?? null : null;
  return (
    <>
      <header className="nav">
        <div className="wrap">
          <a className="logo" href={`${data.base}/`} aria-label={c.profile.fullTitle}>
            {c.profile.logo ? <img src={c.profile.logo} alt={c.profile.fullTitle} /> : <span className="logo-text">{c.profile.fullTitle}</span>}
          </a>
          <span className="quiz-who">{c.profile.fullTitle}</span>
        </div>
      </header>
      <main className="wrap quiz-wrap">
        <QuizApp slug={data.slug} base={data.base} quiz={summary} form={form} />
      </main>
    </>
  );
}
