import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/server/site";
import { QuizApp, type QuizSummary } from "@/components/QuizApp";
import { PollApp, type PollSummary } from "@/components/PollApp";
import { ui } from "@/lib/i18n";
import { ActionButton } from "@/components/ActionButton";
import { LeadForms } from "@/components/LeadForms";
import { chatConfig } from "@/lib/chat";
import { LandingPageView } from "@/components/LandingPageView";
import { PageVisit } from "@/components/PageVisit";

type Props = PageProps<"/sites/[site]/[quiz]">;

async function load(params: Props["params"]) {
  const { site, quiz: raw } = await params;
  const data = await getSiteData(decodeURIComponent(site));
  if (data.kind !== "tenant") return null;
  const path = decodeURIComponent(raw);
  const quiz = data.content.quizzes.find((q) => q.path === path);
  if (quiz) return { data, quiz, poll: null, page: null };
  // Votes and pages (offers, requests) share the same page addresses (teacher.com/<path>).
  const poll = data.content.polls.find((p) => p.path === path);
  if (poll) return { data, quiz: null, poll, page: null };
  const page = data.content.pages.find((p) => p.path === path && p.enabled);
  return page ? { data, quiz: null, poll: null, page } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load(params);
  if (!r) return { robots: { index: false, follow: false } };
  const { data, quiz, poll, page } = r;
  if (page) {
    const index = page.indexable && data.indexable;
    const url = data.canonical ? `${data.canonical}/${page.path}` : undefined;
    return {
      title: `${page.title} | ${data.content.profile.fullTitle}`,
      description: page.description,
      robots: index ? { index: true, follow: true } : { index: false, follow: data.env === "production" },
      alternates: url ? { canonical: url } : undefined,
      openGraph: { title: page.title, description: page.description, url, type: "website", images: page.image ? [page.image] : undefined },
    };
  }
  if (poll) {
    // Shared in stories and groups: a good preview card, never listed by search engines.
    const url = data.canonical ? `${data.canonical}/${poll.path}` : undefined;
    return {
      title: `${poll.title} | ${data.content.profile.fullTitle}`,
      description: poll.description ?? ui(data.content.locale).pollDescription,
      robots: { index: false, follow: false },
      openGraph: { title: poll.title, description: poll.description, url, type: "website", images: poll.images[0]?.image ? [poll.images[0].image] : undefined },
    };
  }
  if (!quiz) return { robots: { index: false, follow: false } };
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

/** A teacher's quiz, vote or page (offer, request) on its own address: teacher.com/<path> (lib/schema.ts Quiz, Poll, LandingPage). */
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
  const { data, quiz, poll, page } = r;
  const c = data.content;
  const header = (
    <header className="nav">
      <div className="wrap">
        <a className="logo" href={`${data.base}/`} aria-label={c.profile.fullTitle}>
          {c.profile.logo ? <img src={c.profile.logo} alt={c.profile.fullTitle} /> : <span className="logo-text">{c.profile.fullTitle}</span>}
        </a>
        <span className="quiz-who">{c.profile.fullTitle}</span>
      </div>
    </header>
  );
  if (page) {
    return (
      <>
        {header}
        <main className="wrap quiz-wrap lp-wrap"><LandingPageView page={page} c={c} chat={chatConfig(c)} base={data.base} /></main>
        {page.cta.form && <LeadForms forms={c.forms} slug={data.slug} base={data.base} />}
        {data.env === "production" && <PageVisit base={data.base} path={page.path} />}
      </>
    );
  }
  if (poll) {
    const summary: PollSummary = {
      path: poll.path, title: poll.title, description: poll.description, images: poll.images.map((i) => i.image),
      choices: poll.choices, state: poll.state, startsAt: poll.startsAt, durationHours: poll.durationHours,
      submitLabel: poll.submitLabel, doneMessage: poll.doneMessage, showResults: poll.showResults,
    };
    return (
      <>
        {header}
        <main className="wrap quiz-wrap"><PollApp base={data.base} slug={data.slug} poll={summary} /></main>
      </>
    );
  }
  if (!quiz) notFound();
  // Questions and the answer key stay on the server until a student starts.
  const summary: QuizSummary = {
    path: quiz.path, title: quiz.title, intro: quiz.intro, image: quiz.image, durationMinutes: quiz.durationMinutes,
    state: quiz.state, startsAt: quiz.startsAt, endsAt: quiz.endsAt, startLabel: quiz.startLabel, submitLabel: quiz.submitLabel,
    doneMessage: quiz.doneMessage, count: quiz.questions.length,
  };
  const form = quiz.form ? c.forms.find((f) => f.id === quiz.form) ?? null : null;
  return (
    <>
      {header}
      <main className="wrap quiz-wrap">
        <QuizApp
          slug={data.slug} base={data.base} quiz={summary} form={form}
          resultMessage={quiz.selfGrading ? quiz.resultMessage : undefined}
          resultCta={quiz.selfGrading && quiz.resultCta ? <ActionButton action={quiz.resultCta} chat={chatConfig(c)} block /> : undefined}
        />
      </main>
      {/* The button under a self-graded result can open one of the site's forms. */}
      {quiz.selfGrading && quiz.resultCta?.form && <LeadForms forms={c.forms} slug={data.slug} base={data.base} />}
    </>
  );
}
