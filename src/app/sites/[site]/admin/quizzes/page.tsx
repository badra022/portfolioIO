import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { copyFor, getTenant } from "@/lib/server/repo";
import { adminEnv } from "@/lib/server/admin-env";
import { attemptCounts } from "@/lib/server/quiz-attempts";
import { availability } from "@/lib/quiz";
import { QuizStateButtons, quizStatus } from "@/components/admin/QuizBits";

export const metadata: Metadata = { title: "الاختبارات" };

export default async function Quizzes({ params }: PageProps<"/sites/[site]/admin/quizzes">) {
  const site = decodeURIComponent((await params).site);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  if (!slug || !t) notFound();
  const base = baseForSite(site);
  const env = await adminEnv();
  const counts = await attemptCounts(slug, env);
  const quizzes = copyFor(t, env).content.quizzes;
  return (
    <>
      <div className="a-head">
        <a className="a-back" href={`${base}/admin`}>→ كل الأقسام</a>
        <h1>الاختبارات</h1>
        <p className="a-sub">كل اختبار له صفحة خاصة ونتايجه لوحدها. الأسئلة والإجابات الصحيحة بتتعدل من <a href={`${base}/admin/edit/quizzes`}>تعديل الاختبارات</a>.</p>
        <div className="a-actions"><a className="btn-sm primary" href={`${base}/admin/edit/quizzes`}>+ اختبار جديد / تعديل</a></div>
      </div>
      {quizzes.length === 0 && <p className="an-empty">لسه مفيش اختبارات.</p>}
      <ul className="qz-list">
        {quizzes.map((q) => {
          const s = quizStatus(q, availability(q));
          const c = counts[q.path] ?? { total: 0, finished: 0 };
          return (
            <li key={q.path} className="a-panel qz-item">
              <div className="qz-head">
                <span className={`rq-badge ${s.tone}`}>{s.label}</span>
                <b>{q.title}</b>
                <a className="a-sub" dir="ltr" href={`${base}/${q.path}`} target="_blank" rel="noopener">/{q.path}</a>
              </div>
              <p className="a-sub">{q.questions.length} سؤال · {q.durationMinutes ? `${q.durationMinutes} دقيقة` : "بدون وقت"} · {c.total} بدأوا · {c.finished} سلّموا</p>
              <div className="qz-actions">
                <a className="btn-sm primary" href={`${base}/admin/quizzes/${q.path}`}>النتايج</a>
                <QuizStateButtons site={site} path={q.path} state={q.state} env={env} />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
