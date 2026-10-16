import type { SiteEnv } from "@/lib/environments";
import { copyFor, type TenantRecord } from "./repo";
import { countNew } from "./submissions";
import { attemptCounts } from "./quiz-attempts";

/**
 * The numbers on the admin menu and home page: new requests, and handed-in answers
 * still waiting for the teacher's grade (self-grading quizzes never wait, so they
 * don't count). `quizzes` is per quiz path, for the home page's cards.
 */
export async function adminCounts(t: TenantRecord, env: SiteEnv) {
  const [requests, perQuiz] = await Promise.all([t.permissions.forms ? countNew(t.slug, env) : 0, attemptCounts(t.slug, env)]);
  const quizzes = copyFor(t, env).content.quizzes.filter((q) => !q.selfGrading);
  const toGrade = quizzes.map((q) => ({ path: q.path, title: q.title, n: perQuiz[q.path]?.toGrade ?? 0 })).filter((q) => q.n > 0);
  return { requests, grading: toGrade.reduce((n, q) => n + q.n, 0), toGrade, perQuiz };
}
