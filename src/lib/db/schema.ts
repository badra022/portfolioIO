import { bigint, bigserial, boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
}, (t) => [primaryKey({ columns: [t.tenantId, t.day, t.metric, t.key] })]);

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("submissions_tenant_created_idx").on(t.tenantId, t.createdAt)]);
