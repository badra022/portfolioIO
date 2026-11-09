import type { ArticleT, Content, GameT, QuizT } from "./schema";
import { instantOf } from "./dates";
import { availability } from "./quiz";

/**
 * The content library's list pages (/articles, /games, /exams): what each card shows.
 * Pure and safe in the browser. Views come later from /api/views (fresh on every load).
 */
export type LibraryKind = "articles" | "games";

/** A link to one of the library's pages from the home page (sections menu, above the footer). */
export type LibraryLink = { id: "articles" | "exams" | "games"; href: string; count: number };

export type LibraryCard = {
  /** page_view key, e.g. "a:gas-laws" (lib/server/library.ts). */
  key: string;
  path: string;
  href: string;
  title: string;
  summary: string;
  image?: string;
  group?: string;
  tags: string[];
  /** publishAt, shown as the card's date. */
  date?: string;
  showViews: boolean;
};

/** Is it out yet? (No publishAt = yes.) */
export const isPublished = (x: { publishAt?: string }, now = Date.now()) => !x.publishAt || instantOf(x.publishAt).getTime() <= now;

/** The start of the first paragraph, for a card without its own summary. */
export function articleSummary(a: ArticleT): string {
  if (a.summary?.trim()) return a.summary.trim();
  const first = a.blocks.find((b) => b.type === "paragraph" && b.text?.trim())?.text?.trim() ?? "";
  return first.length > 220 ? `${first.slice(0, 217).trimEnd()}…` : first;
}

const firstLine = (s?: string) => (s ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";

/** Newest first: the last one added in the admin panel comes first. */
const newestFirst = <T,>(list: T[]) => [...list].reverse();

export function articleCards(c: Content, base: string, now = Date.now()): LibraryCard[] {
  return newestFirst(c.articles).filter((a) => a.enabled && a.listed && isPublished(a, now)).map((a) => ({
    key: `a:${a.path}`, path: a.path, href: `${base}/articles/${a.path}`, title: a.title, summary: articleSummary(a),
    image: a.image || undefined, group: a.group?.trim() || undefined, tags: a.tags.filter((t) => t.trim()), date: a.publishAt,
    showViews: c.library.showViews && a.showViews,
  }));
}

export function gameCards(c: Content, base: string, now = Date.now()): LibraryCard[] {
  return newestFirst(c.games).filter((g) => g.enabled && g.listed && isPublished(g, now)).map((g) => ({
    key: `g:${g.path}`, path: g.path, href: `${base}/games/${g.path}`, title: g.title, summary: firstLine(g.description),
    image: g.image || undefined, group: g.group?.trim() || undefined, tags: g.tags.filter((t) => t.trim()), date: g.publishAt,
    showViews: c.library.showViews && g.showViews,
  }));
}

export const liveArticle = (c: Content, path: string, now = Date.now()): ArticleT | undefined =>
  c.articles.find((a) => a.path === path && a.enabled && isPublished(a, now));
export const liveGame = (c: Content, path: string, now = Date.now()): GameT | undefined =>
  c.games.find((g) => g.path === path && g.enabled && isPublished(g, now));

/* ---------- the exams page ---------- */

export type ExamTab = "live" | "soon" | "closed";

/** A past exam's published results (lib/server/exam-results.ts publishedExams). */
export type ResultSet = { id: number; title: string; date: string; quizPath: string | null; examId: string | null };

export type ExamEntry =
  | { kind: "quiz"; tab: ExamTab; path: string; href: string; title: string; intro?: string; group?: string; tags: string[]; minutes: number; questions: number;
      selfGrading: boolean; startsAt?: string; endsAt?: string; results: ResultSet | null; showViews: boolean }
  | { kind: "offline"; tab: "soon"; id: string; title: string; date: string; group?: string }
  | { kind: "results"; tab: "closed"; set: ResultSet };

/** Which tab a quiz belongs on, or null when it isn't shown (no questions). */
export function quizTab(q: QuizT, now = Date.now()): ExamTab | null {
  const a = availability(q, now);
  if (a.open) return "live";
  if (a.reason === "notYet") return "soon";
  if (a.reason === "empty") return null;
  return "closed";
}

/**
 * Everything on the exams page: the listed online quizzes (open, coming, finished),
 * the center exams still ahead (to book), and published results that no listed quiz
 * shows (center exams that passed, sheets the teacher typed).
 */
export function examEntries(c: Content, base: string, results: ResultSet[], now = Date.now()): ExamEntry[] {
  const out: ExamEntry[] = [];
  const shown = new Set<number>();
  for (const q of newestFirst(c.quizzes)) {
    if (!q.listed) continue;
    const tab = quizTab(q, now);
    if (!tab) continue;
    const set = results.find((r) => r.quizPath === q.path) ?? null;
    if (set) shown.add(set.id);
    out.push({
      kind: "quiz", tab, path: q.path, href: `${base}/${q.path}`, title: q.title, intro: q.intro, group: q.group?.trim() || undefined,
      tags: q.tags.filter((t) => t.trim()), minutes: q.durationMinutes, questions: q.questions.length, selfGrading: q.selfGrading,
      startsAt: q.startsAt, endsAt: q.endsAt, results: q.selfGrading ? null : set, showViews: c.library.showViews && q.showViews,
    });
  }
  // Center exams: past ones were already removed from the content (lib/content-utils.ts withLiveContent).
  for (const e of c.exams?.items ?? []) out.push({ kind: "offline", tab: "soon", id: e.id, title: e.title, date: e.date, group: e.group?.trim() || undefined });
  for (const r of results) if (!shown.has(r.id) && !(r.quizPath && c.quizzes.some((q) => q.path === r.quizPath && !q.listed))) out.push({ kind: "results", tab: "closed", set: r });
  return out;
}

/** The headings of a list, in the order they first appear; items without one go last. */
export function groupsOf<T extends { group?: string }>(items: T[], other: string): { name: string; items: T[] }[] {
  const order: string[] = [];
  const by = new Map<string, T[]>();
  for (const it of items) {
    const g = it.group ?? "";
    if (!by.has(g)) { by.set(g, []); order.push(g); }
    by.get(g)!.push(it);
  }
  if (order.length === 1 && order[0] === "") return [{ name: "", items }];
  return [...order.filter(Boolean), ...(by.has("") ? [""] : [])].map((g) => ({ name: g || other, items: by.get(g)! }));
}

/** The link a share button sends: the item's address plus ?via=share (to tell shared visits apart later). */
export const shareUrl = (origin: string, href: string) => `${origin}${href}${href.includes("?") ? "&" : "?"}via=share`;
