import type { QuizT } from "./schema";
import { deadline, instantOf } from "./dates";

/** Whether a quiz takes new students right now, and why not. Same answer on the server and in the browser. */
export type Availability = { open: true } | { open: false; reason: "closed" | "notYet" | "over" | "empty"; at?: string };

/** What availability needs: works with the full quiz (server) or the page's summary of it (browser). */
type QuizWindow = Pick<QuizT, "state" | "startsAt" | "endsAt"> & { questions: { length: number } };

export function availability(q: QuizWindow, now = Date.now()): Availability {
  if (q.state === "closed") return { open: false, reason: "closed" };
  if (!q.questions.length) return { open: false, reason: "empty" };
  if (q.state === "open") return { open: true };
  if (q.startsAt && now < instantOf(q.startsAt).getTime()) return { open: false, reason: "notYet", at: q.startsAt };
  if (q.endsAt && now >= deadline(q.endsAt).getTime()) return { open: false, reason: "over" };
  return { open: true };
}

/** When an attempt started now must end: the timer, or the quiz's end date, whichever comes first. */
export function attemptDeadline(q: QuizT, startedAt: number): number | null {
  const timer = q.durationMinutes > 0 ? startedAt + q.durationMinutes * 60_000 : null;
  const end = q.state === "auto" && q.endsAt ? deadline(q.endsAt).getTime() : null;
  if (timer === null) return end;
  return end === null ? timer : Math.min(timer, end);
}

/** The questions as students see them: no answer key, no points. */
export type PublicQuestion = { text?: string; image?: string; type: "choice" | "text"; options: string[] };
export const publicQuestions = (q: QuizT): PublicQuestion[] =>
  q.questions.map((x) => ({ text: x.text, image: x.image, type: x.type, options: x.type === "choice" ? x.options : [] }));

/**
 * How answers are compared: surrounding and repeated spaces, upper/lower case,
 * Arabic diacritics and tatweel are ignored, and Arabic-Indic digits (and the
 * Arabic decimal point) count as Latin ones. Letters themselves are compared as written: the teacher lists the
 * accepted spellings as several correct answers.
 */
export function normalizeAnswer(v: string): string {
  return v
    .normalize("NFKC")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066B/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type Graded = {
  /** Per question: true/false when graded, null when the question has no answer key. */
  marks: (boolean | null)[];
  score: number;
  max: number;
  /** score / max as a whole percentage, or null when nothing is graded. */
  percent: number | null;
};

/** Grades answers (by question index) against the quiz's current answer key. */
export function grade(q: QuizT, answers: Record<string, string>): Graded {
  let score = 0, max = 0;
  const marks = q.questions.map((x, i) => {
    if (!x.correct.length) return null;
    max += x.points;
    const a = normalizeAnswer(answers[String(i)] ?? "");
    const ok = a !== "" && x.correct.some((c) => normalizeAnswer(c) === a);
    if (ok) score += x.points;
    return ok;
  });
  return { marks, score, max, percent: max ? Math.round((score / max) * 100) : null };
}

/** What a self-grading quiz shows the student after handing in (schema.ts Quiz.selfGrading). */
export type SelfResult = Graded & {
  passed: boolean;
  /** Questions without an answer key (graded by the teacher later, not counted here). */
  ungraded: number;
  /** The accepted answers per question, when the teacher shows them (empty list for ungraded ones). */
  correct?: string[][];
};

export function selfResult(q: QuizT, answers: Record<string, string>): SelfResult {
  const g = grade(q, answers);
  return {
    ...g,
    passed: g.percent !== null && g.percent >= q.passPercent,
    ungraded: g.marks.filter((m) => m === null).length,
    ...(q.showCorrect ? { correct: q.questions.map((x) => (x.type === "choice" ? x.correct : x.correct.slice(0, 1))) } : {}),
  };
}

/**
 * The student's name and phone on an attempt, from the quiz's form: the field
 * with id "name" (or a text field labelled name/اسم, or the first text field),
 * and the mobile field (or the number the attempt was registered with).
 */
export function studentOf(form: { fields: { id: string; label: string; type: string }[] } | undefined, fields: Record<string, string>, contact: string | null): { name: string; phone: string } {
  const list = form?.fields ?? Object.keys(fields).map((id) => ({ id, label: id, type: /phone|tel|mobile/i.test(id) ? "tel" : "text" }));
  const text = list.filter((f) => f.type === "text");
  const nameId = list.find((f) => f.id === "name")?.id ?? text.find((f) => /name|اسم/i.test(`${f.id} ${f.label}`))?.id ?? text[0]?.id;
  const phoneId = list.find((f) => f.type === "tel")?.id;
  return { name: (nameId && fields[nameId]) || "", phone: (phoneId && fields[phoneId]) || contact || "" };
}
