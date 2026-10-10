import { connection } from "next/server";
import { hasDb } from "@/lib/env";
import { getSiteData } from "@/lib/server/site";
import { activeTenantId } from "@/lib/server/analytics";
import { parseIncoming } from "@/lib/server/submissions";
import { resumeAttempt, saveAnswers, startAttempt } from "@/lib/server/quiz-attempts";

const MAX_BODY = 64 * 1024;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * The quiz page's server side (components/QuizApp.tsx):
 * - start  { quiz, values }          -> a new attempt (or the existing one for that mobile number)
 * - resume { token }                 -> where the attempt stands (after a refresh)
 * - save   { token, answers }        -> autosave while answering
 * - submit { token, answers }        -> hand in (button or timer)
 * Questions only leave the server once an attempt starts, and the answer key never does.
 */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/quiz">) {
  await connection();
  const site = decodeURIComponent((await ctx.params).site);
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ ok: false, error: "too large" }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(text); } catch { return json({ ok: false, error: "bad request" }, 400); }

  const data = await getSiteData(site);
  if (data.kind !== "tenant") return json({ ok: false, error: "not found" }, 404);
  if (!hasDb()) return json({ ok: false, error: "unavailable" }, 503);
  const tenantId = await activeTenantId(data.slug);
  if (!tenantId) return json({ ok: false, error: "not found" }, 404);
  const quizzes = data.content.quizzes;

  try {
    switch (body.op) {
      case "start": {
        const quiz = quizzes.find((q) => q.path === body.quiz);
        if (!quiz) return json({ ok: false, error: "not found" }, 404);
        const form = quiz.form ? data.content.forms.find((f) => f.id === quiz.form) : undefined;
        const values = parseIncoming({ form: "x", values: body.values })?.values ?? {};
        const r = await startAttempt(tenantId, data.env, quiz, form, values);
        return r.ok ? json({ ok: true, attempt: r.attempt, resumed: r.resumed }) : json({ ok: false, error: r.error, errors: r.errors }, r.errors ? 422 : 409);
      }
      case "resume": {
        const a = await resumeAttempt(tenantId, quizzes, body.token);
        return a ? json({ ok: true, attempt: a }) : json({ ok: false, error: "unknown attempt" }, 404);
      }
      case "save":
      case "submit": {
        const a = await saveAnswers(tenantId, quizzes, body.token, body.answers, body.op === "submit");
        return a ? json({ ok: true, attempt: a }) : json({ ok: false, error: "unknown attempt" }, 404);
      }
      default:
        return json({ ok: false, error: "bad request" }, 400);
    }
  } catch (e) {
    console.error("quiz", e);
    return json({ ok: false, error: "server" }, 500);
  }
}
