import { bigint, bigserial, boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** One row per teacher. content/theme hold the same JSON that tenants/<slug>/*.json hold, validated by Zod on every write. */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
  content: jsonb("content").notNull(),
  theme: jsonb("theme").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
  /**
   * The private preview copy (lib/environments.ts): edits saved "to preview" land
   * here until they are published. Null = preview shows production.
   */
  previewContent: jsonb("preview_content"),
  previewTheme: jsonb("preview_theme"),
  previewVersion: integer("preview_version").notNull().default(0),
  previewUpdatedAt: timestamp("preview_updated_at", { withTimezone: true }),
  previewUpdatedBy: text("preview_updated_by"),
});

/** Custom domains that serve a teacher. Each must also be added to the Vercel project. */
export const tenantDomains = pgTable("tenant_domains", {
  domain: text("domain").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("tenant_domains_tenant_idx").on(t.tenantId)]);

/** Teacher logins (basic auth). The super admin lives in env vars, not here. */
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
}, (t) => [index("admin_users_tenant_idx").on(t.tenantId)]);

/** Every save keeps a full snapshot, so any change can be restored. */
export const tenantRevisions = pgTable("tenant_revisions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: jsonb("content").notNull(),
  theme: jsonb("theme").notNull(),
  author: text("author").notNull(),
  note: text("note"),
  /** Which copy was saved: production or the preview. */
  env: text("env", { enum: ["production", "preview"] }).notNull().default("production"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("tenant_revisions_tenant_idx").on(t.tenantId, t.createdAt)]);

/**
 * Site analytics as daily counters (see lib/analytics.ts): one row per teacher,
 * Cairo day, metric and key, e.g. (day, "click", "whatsapp") = 37. No visitor data.
 */
export const analyticsDaily = pgTable("analytics_daily", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  metric: text("metric").notNull(),
  key: text("key").notNull().default(""),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  /** Where it came from: the public site or the private preview (lib/environments.ts). */
  env: text("env", { enum: ["production", "preview"] }).notNull().default("production"),
}, (t) => [primaryKey({ columns: [t.tenantId, t.env, t.day, t.metric, t.key] })]);

/**
 * What students sent through a form button (name, phone... plus what they picked:
 * the challenge answer, the group, the exam). The teacher works through them in
 * /admin/requests: new -> contacted -> done.
 */
export const submissions = pgTable("submissions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  formId: text("form_id").notNull(),
  /** The button's label (and ref code), e.g. "أرسل إجابتك (CHALLENGE-2)". */
  source: text("source").notNull().default(""),
  /** Page area of the button: a section key, "nav", "sticky", "popup"... */
  place: text("place").notNull().default(""),
  /** The form's answers, by field id. */
  fields: jsonb("fields").notNull(),
  /** What the button carried: { "السؤال": "...", "الإجابة": "..." }. */
  context: jsonb("context").notNull(),
  status: text("status", { enum: ["new", "contacted", "done"] }).notNull().default("new"),
  /** Where it came from: the public site or the private preview (lib/environments.ts). */
  env: text("env", { enum: ["production", "preview"] }).notNull().default("production"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("submissions_tenant_created_idx").on(t.tenantId, t.createdAt)]);

/**
 * One student's go at a quiz. The deadline lives here, so refreshing or switching
 * devices can't reset the timer; answers are saved as the student goes, so a
 * timeout submits the latest ones even if the page was closed. Scores are worked
 * out when the results are viewed, from the quiz's current answer key.
 */
export const quizAttempts = pgTable("quiz_attempts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  /** The quiz's path (content.quizzes[].path). */
  quizPath: text("quiz_path").notNull(),
  /** Secret held by the student's browser; whoever has it can continue the attempt. */
  token: text("token").notNull().unique(),
  /** Normalized mobile number from the form, if it has one: one attempt per number. */
  contact: text("contact"),
  /** The quiz form's answers (name, phone...). */
  fields: jsonb("fields").notNull(),
  /** Answers by question number (index), as typed or chosen. */
  answers: jsonb("answers").notNull(),
  /** The questions as shown (text and options, no answer key), for reading the attempt later. */
  questions: jsonb("questions").notNull(),
  status: text("status", { enum: ["in_progress", "submitted", "timed_out"] }).notNull().default("in_progress"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  /** Where it came from: the public site or the private preview (lib/environments.ts). */
  env: text("env", { enum: ["production", "preview"] }).notNull().default("production"),
}, (t) => [
  index("quiz_attempts_quiz_idx").on(t.tenantId, t.quizPath, t.startedAt),
  // One attempt per number and environment: trying a quiz in preview doesn't use up the real one.
  uniqueIndex("quiz_attempts_contact_idx").on(t.tenantId, t.env, t.quizPath, t.contact).where(sql`${t.contact} is not null`),
]);

/**
 * Small text files a teacher's site serves from its root (lib/site-files.ts):
 * search-engine verification files, IndexNow keys, ads.txt, .well-known/…
 * Managed by the super admin only.
 */
export const tenantFiles = pgTable("tenant_files", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  /** Path without the leading slash, e.g. "google123.html" or ".well-known/security.txt". */
  name: text("name").notNull(),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
}, (t) => [primaryKey({ columns: [t.tenantId, t.name] })]);

/**
 * Results of one exam, entered or imported by the teacher (/admin/results).
 * Students look theirs up on the site with their name and phone
 * (lib/exam-results.ts); the rows are never sent to the browser as a whole.
 */
export const examResults = pgTable("exam_results", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  /** The exam on the page this belongs to (content.exams.items[].id), if any. */
  examId: text("exam_id"),
  title: text("title").notNull(),
  /** YYYY-MM-DD. */
  date: text("date").notNull(),
  /** Full mark, e.g. "50". Optional. */
  total: text("total"),
  /** Shown on the site (in the exams section) only when published. */
  published: boolean("published").notNull().default(false),
  /** [{ name, phone, score, note? }] (lib/exam-results.ts ResultRow). */
  rows: jsonb("rows").notNull().default(sql`'[]'::jsonb`),
  /** Bumped on every change, so two people editing at once don't overwrite each other. */
  version: integer("version").notNull().default(1),
  /** Students who looked up a result, and how many found theirs. */
  lookups: integer("lookups").notNull().default(0),
  found: integer("found").notNull().default(0),
  /** The same for the private preview: shown there when published to preview, with its own counts. */
  previewPublished: boolean("preview_published").notNull().default(false),
  previewLookups: integer("preview_lookups").notNull().default(0),
  previewFound: integer("preview_found").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
}, (t) => [index("exam_results_tenant_idx").on(t.tenantId, t.date)]);
