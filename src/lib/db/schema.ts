import { bigint, bigserial, boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Marketing agencies the platform works with (admin/partners): each has a private
 * sign-up page at <platform>/<slug>, behind its own login, where it builds as many
 * trial sites for its clients as it likes (lib/server/partners.ts). The same login
 * manages every teacher site that belongs to the partner.
 */
export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** The page's address on the platform: myostaz.com/<slug>. */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  disabled: boolean("disabled").notNull().default(false),
  /** How long the partner's trial sites work. */
  trialHours: integer("trial_hours").notNull().default(72),
  /** The sign-up page's own settings (lib/partners.ts PartnerForm): intro text and extra fields. */
  form: jsonb("form").notNull().default(sql`'{}'::jsonb`),
  /** The super admin's own notes about the partner. */
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

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
  /** What the teacher's plan includes (lib/permissions.ts). Empty = nothing paid (new teachers). */
  permissions: jsonb("permissions").notNull().default(sql`'{}'::jsonb`),
  /**
   * Free trial sites (made from the public «جرّب موقعك» form): the site and its
   * logins stop working after this moment until a super admin activates it.
   * Null = a normal site.
   */
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  /** Trial sites: a salted hash of the sign-up's address, only to limit sign-ups per visitor. */
  signupKey: text("signup_key"),
  /** Trial sites: the WhatsApp number (international digits, lib/phone.ts); unique, so one trial per number. */
  signupPhone: text("signup_phone"),
  /** Trial sites: when the sign-up accepted the trial terms (/terms). */
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  /** The partner (agency) this teacher came from and who manages the site; null = the platform's own. */
  partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "set null" }),
}, (t) => [uniqueIndex("tenants_signup_phone_key").on(t.signupPhone), index("tenants_partner_idx").on(t.partnerId)]);

/**
 * Every free trial request from the platform's home page (lib/server/signup.ts):
 * the lead's details and what they asked for. Kept when the trial site is deleted
 * (tenant_id becomes null), so the super admin's list of leads stays complete.
 */
export const trialRequests = pgTable("trial_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  /** The site address asked for (still shown after the site is deleted). */
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  title: text("title"),
  subject: text("subject"),
  /** WhatsApp number, international digits (lib/phone.ts). */
  phone: text("phone"),
  locale: text("locale"),
  username: text("username"),
  /** «ملاحظات أو طلبات خاصة» from the form. */
  notes: text("notes"),
  /** Made from a partner's page (null = the platform's home page). */
  partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "set null" }),
  /** Answers to the partner's own extra fields: { label: answer }. */
  extra: jsonb("extra"),
}, (t) => [index("trial_requests_created_idx").on(t.createdAt), index("trial_requests_partner_idx").on(t.partnerId)]);

/**
 * Daily counters for the platform's sign-up pages (lib/server/funnel.ts): views,
 * how far visitors got in the sign-up form, builds. Cairo days.
 */
export const platformDaily = pgTable("platform_daily", {
  day: date("day").notNull(),
  /** Which page: "" = the platform's home page, else a partner's slug. */
  source: text("source").notNull().default(""),
  metric: text("metric").notNull(),
  key: text("key").notNull().default(""),
  value: bigint("value", { mode: "number" }).notNull().default(0),
}, (t) => [primaryKey({ columns: [t.day, t.source, t.metric, t.key] })]);

/** Verification codes sent from the sign-up form (lib/server/otp.ts), only to limit how many are sent. */
export const signupOtps = pgTable("signup_otps", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone").notNull(),
  /** Salted hash of the sender's address (lib/server/signup.ts visitorKey). */
  visitor: text("visitor").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("signup_otps_phone_idx").on(t.phone, t.createdAt), index("signup_otps_visitor_idx").on(t.visitor, t.createdAt)]);

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
  /** The student profile this request belongs to (lib/server/students.ts), set when profiles are synced. */
  studentId: bigint("student_id", { mode: "number" }),
  /** Where it came from: the public site or the private preview (lib/environments.ts). */
  env: text("env", { enum: ["production", "preview"] }).notNull().default("production"),
  /** The referral partner's code (content.referrals) when the student came through their link. */
  ref: text("ref"),
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
  /**
   * The teacher's grade: { name, phone, score, note? } (lib/exam-results.ts ResultRow).
   * Saved as a draft until approved; approved grades join the quiz's exam results
   * (exam_results.quiz_path) and students can look them up.
   */
  result: jsonb("result"),
  /** The referral partner's code (content.referrals) when the student came through their link. */
  ref: text("ref"),
  /** The student profile this attempt belongs to (lib/server/students.ts), set when profiles are synced. */
  studentId: bigint("student_id", { mode: "number" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
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
  /**
   * The online quiz (content.quizzes[].path) whose approved grades are part of these
   * results, next to the rows entered by hand. Created automatically, one per quiz.
   */
  quizPath: text("quiz_path"),
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
}, (t) => [
  index("exam_results_tenant_idx").on(t.tenantId, t.date),
  uniqueIndex("exam_results_quiz_idx").on(t.tenantId, t.quizPath).where(sql`${t.quizPath} is not null`),
]);

/**
 * Anonymous votes (content.polls): only a count per choice, nothing about who
 * voted. Choices are counted by their position in the poll.
 */
export const pollVotes = pgTable("poll_votes", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  /** The public site or the private preview (lib/environments.ts). */
  env: text("env", { enum: ["production", "preview"] }).notNull().default("production"),
  pollPath: text("poll_path").notNull(),
  choice: integer("choice").notNull(),
  votes: integer("votes").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.tenantId, t.env, t.pollPath, t.choice] })]);

/**
 * The anonymous complaints box (content.complaints, lib/server/complaints.ts).
 * Deliberately nothing that could point to the student: no name, phone, student
 * id, referral, device or IP, and the day only (no time of day).
 */
export const complaints = pgTable("complaints", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  env: text("env", { enum: ["production", "preview"] }).notNull().default("production"),
  /** Cairo day it was sent. */
  day: date("day").notNull(),
  /** One of the section's categories, or null. */
  topic: text("topic"),
  message: text("message").notNull(),
  status: text("status", { enum: ["new", "read", "done"] }).notNull().default("new"),
}, (t) => [index("complaints_tenant_idx").on(t.tenantId, t.env, t.day)]);

/**
 * One profile per student and phone number (lib/server/students.ts), built from
 * their requests, quizzes and exam results. traits = their answers to profile
 * fields ({ fieldId: { label, value, at, by } }); by = "form" (latest answer wins)
 * or "teacher" (typed in the admin, never overwritten by a form).
 */
export const students = pgTable("students", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  env: text("env", { enum: ["production", "preview"] }).notNull().default("production"),
  /** lib/exam-results.ts phoneKey: digits without country code or leading zero. */
  phoneKey: text("phone_key").notNull(),
  phone: text("phone").notNull(),
  name: text("name").notNull().default(""),
  /** The teacher set the name: later forms don't change it. */
  nameByTeacher: boolean("name_by_teacher").notNull().default(false),
  traits: jsonb("traits").notNull().default(sql`'{}'::jsonb`),
  notes: text("notes").notNull().default(""),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("students_phone_idx").on(t.tenantId, t.env, t.phoneKey)]);

/** How far profiles are synced from requests and quiz attempts (by id), per teacher and environment. */
export const studentSync = pgTable("student_sync", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  env: text("env", { enum: ["production", "preview"] }).notNull(),
  lastSubmission: bigint("last_submission", { mode: "number" }).notNull().default(0),
  lastAttempt: bigint("last_attempt", { mode: "number" }).notNull().default(0),
}, (t) => [primaryKey({ columns: [t.tenantId, t.env] })]);
