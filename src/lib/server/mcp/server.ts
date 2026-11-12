import "server-only";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { env } from "@/lib/env";
import { isPlatformHost } from "@/lib/routing";
import { ContentSchema, ThemeSchema, type Content, type Theme } from "@/lib/schema";
import { IMAGE_PATHS, mapImages, validate, type Issue } from "@/lib/content-utils";
import { FEATURES, FEATURE_INFO, type Feature } from "@/lib/permissions";
import { labelFor } from "@/lib/admin/labels";
import * as repo from "../repo";
import { DOMAINS_TAG, tenantTag } from "../site";
import { assetBase, assetUrl } from "../assets";
import { listBundled, readBundledJson } from "../bundled";
import { getObject, listObjects } from "../storage";
import { generatePassword, hashPassword } from "../passwords";
import { ImageError, SLUG_RE, USERNAME_RE, loginUrlFor, normalizeDomain, sniffImage, storeImage } from "../admin-ops";
import { makeUploadLink } from "../upload-link";
import { absolute, addressFor, siteAddress } from "../address";
import { RANGES, report } from "../analytics";
import { STATUSES, listSubmissions, setStatus } from "../submissions";
import { GradeError, approveAll, attemptCounts, listAttempts, quizMetrics, reviewAttempt, type AttemptRow } from "../quiz-attempts";
import { resultsFor as pollResultsFor } from "../polls";
import { pollStatus, pollTimes } from "@/lib/poll";
import * as examResults from "../exam-results";
import { SiteFileError, deleteSiteFile, filesTag, listSiteFiles, putSiteFile } from "../site-files";
import { PathError, applyOps, canonicalOps, contentOutline, deepMerge, diff, expectedAt, getAt, mirrorOps, schemaAt, schemaFor, summarize, type Change, type Op } from "./content-ops";
import { fetchImage } from "./fetch-image";
import { GameFileError, MAX_GAME_BYTES, listGameFiles, saveGameFile } from "../games";
import { ENVS, type SiteEnv } from "@/lib/environments";
import type { McpScope } from "../oauth";
import { GUIDES, GUIDE_TITLES, GUIDE_TOPICS, PROMPTS } from "./guides";
import { recordUsage } from "./usage";

const INSTRUCTIONS = `myostaz hosts one marketing site per teacher (mostly Arabic, right-to-left, Egypt). Its buttons open a chat (usually WhatsApp) with a pre-written message, or a form. These tools do what the admin panel does, on the live database; every save is validated, recorded under your signed-in account, and kept as a version for 7 days (restore_revision).

How to work:
- Read small: get_teacher returns a summary (sections, list sizes, item ids). Fetch only what you need with keys or path.
- Edit small: edit_content with paths; pick list items by their id, e.g. schedule.slots[id=S3A].time, quizzes[path=chem-exam].title. Pass dry_run: true to check a change without saving.
- Saves go to the private preview unless target is "production". A reply with "live": false is NOT on the public site yet: send the user the preview link, and call publish_preview only when they approve.
- Errors are JSON with a code and a fix. Follow the fix; don't retry the same call unchanged.
- Never invent facts (prices, phone numbers, grades, dates, results): ask, or leave the optional field out. Write in the page's own language and tone (Egyptian Arabic unless told otherwise).
- Before working in an area, read its guide once: get_guide with topic ${GUIDE_TOPICS.join(", ")}.`;

/* ---------------- results and errors ---------------- */

/**
 * Error codes an agent can act on. Every failed call answers
 * { error: { code, message, fix?, message_ar?, … } }: message says what happened (English),
 * fix what to do next, message_ar what to tell the teacher.
 */
export type ErrorCode =
  | "NOT_FOUND" | "NOT_YOUR_SITE" | "SLUG_REQUIRED" | "VALIDATION" | "PLAN_FEATURE_OFF" | "VERSION_CONFLICT"
  | "BAD_PATH" | "BAD_INPUT" | "REVISION_GONE" | "NO_DATABASE" | "INTERNAL";

const codes = new WeakMap<CallToolResult, ErrorCode>();

const ok = (data: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(data) }] });
function fail(code: ErrorCode, message: string, extra: Record<string, unknown> = {}): CallToolResult {
  const r: CallToolResult = { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code, message, ...extra } }) }] };
  codes.set(r, code);
  return r;
}
const noTeacher = (slug: string) => fail("NOT_FOUND", `No teacher "${slug}".`, { fix: "list_teachers shows the ids you can use." });

function refreshTeacher(slug: string, domains = false) {
  revalidateTag(tenantTag(slug), { expire: 0 });
  if (domains) revalidateTag(DOMAINS_TAG, { expire: 0 });
}

const slugArg = z.string().optional().describe("Teacher id (list_teachers). Optional if you reach only one site.");
const targetArg = z.enum(ENVS).optional().describe("preview (default) or production (live now).");
const envArg = z.enum(ENVS).optional().describe("Default production.");
const dryRunArg = z.boolean().optional().describe("Check and list the changes without saving.");
const expectedArg = z.number().int().optional().describe("Version you read; refused if it changed since.");

async function templateContent(from: string): Promise<{ content: Content; theme: Theme; source: string } | null> {
  const t = await repo.getTenant(from);
  if (t) return { content: t.content, theme: t.theme, source: `teacher "${from}"` };
  if (listBundled().includes(from)) {
    return { content: ContentSchema.parse(readBundledJson(from, "content.json")), theme: ThemeSchema.parse(readBundledJson(from, "theme.json")), source: `bundled "${from}"` };
  }
  return null;
}

function usedImages(content: Content): Set<string> {
  const used = new Set<string>();
  mapImages(content, (v) => { used.add(v); return v; });
  return used;
}

/** Validation issues for an agent: English first, the admin panel's Arabic next to it, and what the field expects. */
function explain(issues: Issue[], candidate: { content?: unknown; theme?: unknown }) {
  const english = new Map<string, string>();
  for (const [schema, value, prefix] of [[ContentSchema, candidate.content, ""], [ThemeSchema, candidate.theme, "theme."]] as const) {
    if (value === undefined) continue;
    const r = schema.safeParse(value, { error: z.locales.en().localeError });
    if (!r.success) for (const i of r.error.issues) english.set(prefix + i.path.map(String).join("."), i.message);
  }
  return issues.slice(0, 15).map((i) => {
    const expected = expectedAt(i.path);
    return { path: i.path, message: english.get(i.path) ?? i.message, ...(english.has(i.path) ? { message_ar: i.message } : {}), ...(expected ? { expected } : {}) };
  });
}

/* ------------------------------------------------------------------ */

/** Tools only the super admin gets: making teachers, plans, switching sites on/off, domains. */
const SUPER_ONLY = new Set(["create_teacher", "set_teacher_status", "manage_domain", "manage_plan"]);
/** Also not offered to a teacher's own login: what their admin panel doesn't let them do either (theme, logins, site files). */
const NOT_FOR_TEACHERS = new Set([...SUPER_ONLY, "update_theme", "manage_login", "manage_site_files"]);

type Shape = Record<string, z.ZodType>;
type Args<S extends Shape> = z.infer<z.ZodObject<S>>;
/** After the wrapper, a tool that takes slug always has one. */
type Filled<S extends Shape> = S extends { slug: z.ZodType } ? Omit<Args<S>, "slug"> & { slug: string } : Args<S>;
type ToolConfig<S extends Shape> = {
  title: string;
  description: string;
  input?: S;
  /** read: changes nothing. write: saves something that can be undone or redone. destructive: deletes, publishes or switches off. */
  kind: "read" | "write" | "destructive";
};

/**
 * scope: everything (the super admin's MCP_TOKEN or OAuth login), or one partner's (or one
 * teacher's) sites, from their OAuth login (lib/server/oauth.ts). What is saved is recorded
 * under scope.actor: the account that connected the AI app, named as in the admin panel.
 */
export function buildMcpServer(origin: string, scope: McpScope): McpServer {
  const limited = scope.kind !== "super";
  const actor = scope.actor;
  const mine = limited ? scope.slugs : null;
  const only = mine?.size === 1 ? [...mine][0] : null;
  const hidden = scope.kind === "super" ? new Set<string>() : scope.kind === "teacher" ? NOT_FOR_TEACHERS : SUPER_ONLY;

  const server = new McpServer({ name: "myostaz", version: "2.0.0" }, {
    instructions: !limited ? INSTRUCTIONS
      : scope.kind === "teacher"
        ? `${INSTRUCTIONS}\n\nYou are signed in as the teacher's own admin login "${scope.name}" and reach only their site (${[...scope.slugs].join(", ")}), so slug can be left out. The site's colors and fonts, logins, domains, plan and turning the site on or off are done by the platform admin (myostaz).`
        : `${INSTRUCTIONS}\n\nYou are signed in as ${scope.name} and reach only these teachers: ${[...scope.slugs].join(", ") || "(none yet)"}. New trial sites are made from the partner's page on myostaz.com; creating teachers, plans, turning sites on/off and domains are done by the platform admin.`,
  });

  /** The teacher's address (lib/server/address.ts) as a full URL. */
  const siteUrl = (slug: string, domains: { domain: string; isPrimary: boolean }[]) => absolute(siteAddress(slug, domains), origin);
  // Local development serves files from /local-assets; make every link absolute.
  const abs = (url: string) => (url.startsWith("/") ? `${origin}${url}` : url);

  /**
   * Registers a tool behind the checks every call gets: the site defaults to the only one
   * this login reaches, other people's sites are refused, thrown errors come back as
   * readable tool errors, and the call is counted (lib/server/mcp/usage.ts).
   */
  function tool<S extends Shape>(name: string, cfg: ToolConfig<S>, handler: (args: Filled<S>) => Promise<CallToolResult>) {
    if (hidden.has(name)) return;
    const takesSlug = Boolean(cfg.input && "slug" in cfg.input);
    const run = async (raw: Record<string, unknown> | undefined): Promise<CallToolResult> => {
      const args: Record<string, unknown> = { ...(raw ?? {}) };
      if (takesSlug && typeof args.slug !== "string") {
        if (!only) return fail("SLUG_REQUIRED", "Pass slug: which teacher?", { fix: mine ? `Your sites: ${[...mine].join(", ") || "(none yet)"}.` : "list_teachers shows the ids." });
        args.slug = only;
      }
      if (mine) {
        for (const k of ["slug", "copy_from"]) {
          const v = args[k];
          if (typeof v === "string" && !mine.has(v)) return fail("NOT_YOUR_SITE", `"${v}" isn't one of your sites.`, { fix: `Your sites: ${[...mine].join(", ") || "(none yet)"}.` });
        }
        // Examples come from their own sites only (the bundled example is a real teacher's page).
        if (name === "get_example") {
          const from = typeof args.from === "string" ? args.from : [...mine][0];
          if (!from) return fail("NOT_FOUND", "You have no sites yet.", { fix: "Make one from your page on myostaz.com first." });
          if (!mine.has(from)) return fail("NOT_YOUR_SITE", `"${from}" isn't one of your sites.`);
          args.from = from;
        }
      }
      try { return await handler(args as Filled<S>); } catch (e) {
        if (e instanceof repo.ReadOnlyError) return fail("NO_DATABASE", "No database is connected (DATABASE_URL), so nothing can be saved.");
        if (e instanceof PathError) return fail("BAD_PATH", e.message, { fix: "get_teacher with a path one level up shows what is there." });
        console.error("mcp", name, e);
        return fail("INTERNAL", e instanceof Error ? e.message : "Unexpected error.");
      }
    };
    const register = server.registerTool.bind(server) as unknown as (name: string, config: unknown, cb: (args: Record<string, unknown> | undefined) => Promise<CallToolResult>) => unknown;
    register(name, {
      title: cfg.title,
      description: cfg.description,
      ...(cfg.input ? { inputSchema: cfg.input } : {}),
      // Read tools can be auto-approved by the app; destructive ones ask first.
      annotations: cfg.kind === "read" ? { readOnlyHint: true } : { destructiveHint: cfg.kind === "destructive" },
    }, async (raw) => {
      const started = Date.now();
      const result = await run(raw);
      const row = {
        actor, scope: scope.kind, tool: name, ms: Date.now() - started,
        slug: typeof raw?.slug === "string" ? raw.slug.slice(0, 60) : takesSlug ? only : null,
        bytes: result.content.reduce((n, c) => n + (c.type === "text" ? Buffer.byteLength(c.text) : c.type === "image" ? c.data.length : 0), 0),
        error: codes.get(result) ?? (result.isError ? "INTERNAL" : null),
      };
      try { after(() => recordUsage(row)); } catch { void recordUsage(row); }
      return result;
    });
  }

  /* ----- saving ----- */

  /** A refused save, with what to do about it. */
  function refused(issues: Issue[], candidate: { content?: unknown; theme?: unknown }): CallToolResult {
    const plan = issues.filter((i) => i.feature);
    if (plan.length && plan.length === issues.length) {
      const features = [...new Set(plan.map((i) => i.feature as Feature))];
      return fail("PLAN_FEATURE_OFF", `This site's plan doesn't include: ${features.map((f) => `${f} («${FEATURE_INFO[f].title}»)`).join(", ")}. It can't go on the live site.`, {
        features,
        fix: scope.kind === "super"
          ? `Turn it on with manage_plan { enable: ${JSON.stringify(features)} } if the teacher bought it, then save again.`
          : "Ask the platform admin (myostaz) to add it to the plan. Until then it can be saved to the preview (target \"preview\") but not published.",
        message_ar: plan[0].message,
      });
    }
    const first = issues[0]?.path.split(".")[0];
    return fail("VALIDATION", `Not saved: ${issues.length} field${issues.length === 1 ? "" : "s"} didn't pass validation.`, {
      issues: explain(issues, candidate),
      ...(issues.length > 15 ? { more: issues.length - 15 } : {}),
      fix: `Correct these fields and send the change again.${first && first !== "theme" ? ` get_schema { part: "${first}" } shows the exact shape (add path for one field).` : ""}`,
    });
  }

  const conflict = (version: number, env: SiteEnv) => fail("VERSION_CONFLICT", `Not saved: the ${env} copy changed meanwhile (now version ${version}).`, {
    version, fix: "Read the part again (get_teacher with keys or path), redo the change on it, and pass the new version as expected_version.",
  });

  /**
   * Checks a new content/theme for one copy, and saves it unless dry_run. A production
   * save also goes into the preview copy when the preview has unpublished edits, like in
   * the admin panel (previewNext = the same change applied to the preview copy).
   */
  async function commit(t: repo.TenantRecord, env: SiteEnv, next: { content?: Content; theme?: Theme }, previewNext: { content?: Content; theme?: Theme } | undefined, o: { expected?: number; note: string; dry_run?: boolean; notSynced?: string[] }): Promise<CallToolResult> {
    const current = repo.copyFor(t, env);
    const version = env === "preview" ? t.preview.version : t.version;
    if (o.expected !== undefined && o.expected !== version) return conflict(version, env);
    const checked = await repo.checkSave(t.slug, env, next);
    if (!checked.ok) return refused(checked.issues, next);
    const changes: Change[] = [
      ...(checked.content ? diff(current.content, checked.content) : []),
      ...(checked.theme ? diff(current.theme, checked.theme, "theme") : []),
    ];
    const site = siteUrl(t.slug, t.domains);
    if (!changes.length) return ok({ saved: false, unchanged: true, note: "The copy already has exactly this." });
    if (o.dry_run) {
      return ok({ dry_run: true, valid: true, target: env, would_change: changes.slice(0, 40), ...(changes.length > 40 ? { more: changes.length - 40 } : {}), next: "Send the same call without dry_run to save." });
    }
    const r = env === "preview"
      ? await repo.savePreview(t.slug, next, o.expected ?? t.preview.version, actor, o.note)
      : await repo.saveTenant(t.slug, next, o.expected ?? t.version, actor, o.note);
    if (!r.ok) return r.reason === "invalid" ? refused(r.issues, next) : r.reason === "conflict" ? conflict(r.version, env) : noTeacher(t.slug);
    if (env === "production" && t.preview.pending && previewNext) await repo.savePreview(t.slug, previewNext, null, actor, `${o.note} (منشور على الموقع)`);
    refreshTeacher(t.slug);
    const changed = changes.slice(0, 40).map((c) => c.path);
    const warnings: string[] = [];
    if (o.notSynced?.length) warnings.push(`Saved live, but the preview copy has different content at ${o.notSynced.join(", ")}, so this change was not copied there: publish_preview would bring the old version back. Redo the change with target "preview" or discard the preview (publish_preview action discard).`);
    if (env === "production") {
      const quizzes = [...new Set(changes.map((c) => c.path.match(/^quizzes\[path=([^\]]+)\]\.questions/)?.[1]).filter((x): x is string => Boolean(x)))];
      if (quizzes.length) {
        const counts = await attemptCounts(t.slug, "production");
        const started = quizzes.filter((q) => (counts[q]?.total ?? 0) > 0);
        if (started.length) warnings.push(`Students already started ${started.map((q) => `${q} (${counts[q].total})`).join(", ")}: they keep the questions they got, and grades use the new answer key by question number. Re-check the results with quiz_results before grading.`);
      }
    }
    const extra = warnings.length ? { warnings } : {};
    return ok(env === "preview"
      ? { saved: "preview", live: false, preview_version: r.version, visible_at: `${site}/preview`, publish_with: "publish_preview", changed, ...extra, next: "Not on the public site yet. Ask the user to check the preview, then publish_preview." }
      : { saved: "production", live: true, version: r.version, visible_at: site, changed, ...extra });
  }

  const noteFor = (keys: string[]) => [...new Set(keys)].map((k) => labelFor(k, k)).join("، ");

  /* ----- reading ----- */

  tool("list_teachers", {
    title: "List teachers", kind: "read",
    description: "The teachers you can reach: id (slug), name, status, address. The preview is at <site_url>/preview and the admin panel at <site_url>/admin.",
  }, async () => {
    const all = (await repo.listTenants()).filter((t) => !mine || mine.has(t.slug));
    return ok(all.map((t) => ({ slug: t.slug, name: t.name, status: t.status, site_url: siteUrl(t.slug, t.domains), ...(t.trialEndsAt ? { trial_ends: t.trialEndsAt } : {}), updated_at: t.updatedAt })));
  });

  tool("get_teacher", {
    title: "Read a teacher's page", kind: "read",
    description: "Default: a summary (versions, plan, each section's fields, lists with item ids). keys: whole top-level content keys. path: one value, e.g. \"schedule.slots[id=S3A]\". view \"full\": everything (large).",
    input: {
      slug: slugArg,
      keys: z.array(z.string()).optional().describe("e.g. [\"hero\",\"schedule\"]; \"theme\" for the theme."),
      path: z.string().optional(),
      view: z.enum(["summary", "full"]).optional(),
      env: z.enum(ENVS).optional().describe("production (default, the live site) or preview (where edits go)."),
    },
  }, async ({ slug, keys, path, view, env }) => {
    const t = await repo.getTenant(slug);
    if (!t) return noTeacher(slug);
    const e = env ?? "production";
    const copy = repo.copyFor(t, e);
    const head = { slug: t.slug, env: e, version: t.version, preview_version: t.preview.version, preview_has_unpublished_edits: t.preview.pending };
    if (path) {
      const value = getAt(copy.content, path);
      return value === undefined ? fail("NOT_FOUND", `Nothing at "${path}" in the ${e} copy.`, { fix: "get_teacher without path lists the keys and item ids." }) : ok({ ...head, path, value });
    }
    const content = copy.content as Record<string, unknown>;
    if (keys?.length) {
      const missing = keys.filter((k) => k !== "theme" && !(k in content));
      return ok({ ...head, image_base: abs(assetBase(slug)), content: Object.fromEntries(keys.filter((k) => k in content).map((k) => [k, content[k]])), ...(keys.includes("theme") ? { theme: copy.theme } : {}), ...(missing.length ? { not_set: missing } : {}) });
    }
    const site = siteUrl(slug, t.domains);
    const off = FEATURES.filter((f) => !t.permissions[f]);
    const meta = {
      ...head, name: t.name, status: t.status, updated_at: t.updatedAt, updated_by: t.updatedBy,
      site_url: site, preview_url: `${site}/preview`, image_base: abs(assetBase(slug)),
      domains: t.domains.map((d) => d.domain), logins: (await repo.listUsers(slug)).map((u) => u.username),
      plan: { off, max_forms: t.permissions.maxForms, ...(off.length ? { note: "Parts in \"off\" can be saved to the preview but not to the live site." } : {}) },
      ...(t.preview.pending ? { unpublished_in_preview: diff(t.content, t.preview.content).slice(0, 15).map((c) => c.path), note: "publish_preview publishes ALL of these. To fix something that is live without publishing them, save with target \"production\"." } : {}),
    };
    if (view === "full") return ok({ ...meta, content, theme: copy.theme });
    return ok({ ...meta, content_summary: summarize(content), next: "Fetch what you need with keys or path; address list items by the ids shown, e.g. schedule.slots[id=…]." });
  });

  tool("get_schema", {
    title: "Page structure", kind: "read",
    description: "No arguments: the outline of a page (every top-level content key, required or optional). part: that key's JSON schema with the admin panel's labels and hints. part + path: only one field's schema, e.g. part \"quizzes\", path \"questions\".",
    input: {
      part: z.string().optional().describe("A top-level content key (\"hero\", \"schedule\", \"quizzes\"…) or \"theme\"."),
      path: z.string().optional().describe("A field inside the part, e.g. \"slots\" or \"questions.options\"."),
    },
  }, async ({ part, path }) => {
    if (!part) return ok({ outline: contentOutline(), note: "\"sections\" lists the visible sections in page order; each listed section needs its data. Other keys (profile, contact, socials, nav, sticky, footer, labels, seo, popup) are page-wide.", image_fields: IMAGE_PATHS.map((p) => p.join(".").replaceAll(".[]", "[]")) });
    const s = path ? schemaAt(`${part}.${path}`) : schemaFor(part);
    return s ? ok(s) : fail("NOT_FOUND", `No ${path ? `"${path}" in ` : ""}part "${part}".`, { fix: "get_schema without arguments lists the parts." });
  });

  tool("get_example", {
    title: "Example content", kind: "read",
    description: "Real content to learn the structure and tone from: one key (recommended) or the whole page. Its image values belong to the example teacher and must be replaced.",
    input: {
      key: z.string().optional().describe("One top-level key, e.g. \"schedule\". Omit for the whole page (large)."),
      from: z.string().optional().describe("Teacher to take it from. Default: the first bundled teacher."),
    },
  }, async ({ key, from }) => {
    const src = from ?? listBundled()[0] ?? (await repo.listTenants())[0]?.slug;
    const tpl = src ? await templateContent(src) : null;
    if (!tpl) return fail("NOT_FOUND", "No example teacher available.");
    const content = mapImages(tpl.content, (v) => abs(assetUrl(src!, v)));
    if (key) {
      if (key === "theme") return ok({ source: tpl.source, theme: tpl.theme });
      if (!(key in content)) return fail("NOT_FOUND", `The example has no "${key}".`, { fix: "Try get_example with from set to a teacher that uses it, or rely on get_schema." });
      return ok({ source: tpl.source, [key]: (content as Record<string, unknown>)[key] });
    }
    return ok({ source: tpl.source, content, theme: tpl.theme });
  });

  tool("get_guide", {
    title: "How to do a task", kind: "read",
    description: "Step-by-step guidance for one area. Read it once before working there.",
    input: { topic: z.enum(GUIDE_TOPICS) },
  }, async ({ topic }) => ok({ topic, guide: GUIDES[topic] }));

  /* ----- creating and editing ----- */

  tool("create_teacher", {
    title: "Create a teacher", kind: "write",
    description: "A new teacher page from full content, or copy_from an existing teacher (then replace everything). Online right away unless active is false. Its plan starts with no paid bundles (manage_plan).",
    input: {
      slug: z.string().describe("New id, e.g. \"ahmed-hassan\": lowercase letters, digits, dashes. Permanent."),
      name: z.string().describe("Display name."),
      content: z.record(z.string(), z.unknown()).optional(),
      copy_from: z.string().optional(),
      theme: z.record(z.string(), z.unknown()).optional().describe("Only what differs from the default."),
      active: z.boolean().optional(),
    },
  }, async ({ slug, name, content, copy_from, theme, active }) => {
    if (!SLUG_RE.test(slug)) return fail("BAD_INPUT", "slug: lowercase English letters, digits and dashes only (2-50 chars).");
    if (await repo.getTenant(slug)) return fail("BAD_INPUT", `A teacher "${slug}" already exists.`, { fix: "Edit it with edit_content / update_content, or pick another slug." });
    const fallback = copy_from ?? listBundled()[0] ?? (await repo.listTenants())[0]?.slug;
    const base = fallback ? await templateContent(fallback) : null;
    if (!content && !(copy_from && base)) return fail("BAD_INPUT", "Give content, or copy_from an existing teacher.");
    let draft = content
      ? (content as unknown as Content)
      : mapImages(base!.content, (v) => assetUrl(copy_from!, v));
    draft = { ...draft, slug, profile: { ...(draft.profile ?? {}), name } } as Content;
    const th = deepMerge(base?.theme ?? ({} as Theme), theme ?? {});
    const vc = validate(ContentSchema, draft);
    if (!vc.ok) return refused(vc.issues, { content: draft });
    const vt = validate(ThemeSchema, th);
    if (!vt.ok) return refused(vt.issues.map((i) => ({ ...i, path: `theme.${i.path}` })), { theme: th });
    await repo.createTenant({ slug, name, content: vc.data, theme: vt.data, author: actor });
    if (active === false) await repo.setTenantStatus(slug, "disabled");
    refreshTeacher(slug, true);
    const site = siteUrl(slug, []);
    return ok({ created: true, slug, version: 1, status: active === false ? "disabled" : "active", live: active !== false, site_url: site, preview_url: `${site}/preview`, admin_url: `${site}/admin`, plan: { off: [...FEATURES], note: "No paid bundles yet: manage_plan turns on what the teacher bought." } });
  });

  tool("update_content", {
    title: "Replace whole content keys", kind: "write",
    description: "Replaces whole top-level content keys in one save; null removes an optional key (take it out of \"sections\" too). For anything smaller use edit_content.",
    input: {
      slug: slugArg,
      changes: z.record(z.string(), z.unknown()).describe("{ key: newValue | null }"),
      target: targetArg, expected_version: expectedArg, dry_run: dryRunArg,
      note: z.string().optional().describe("For the history."),
    },
  }, async ({ slug, changes, target, expected_version, dry_run, note }) => {
    const t = await repo.getTenant(slug);
    if (!t) return noTeacher(slug);
    if ("slug" in changes) return fail("BAD_INPUT", "slug can't be changed.");
    const apply = (base: Content) => {
      const content = { ...base } as Record<string, unknown>;
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) delete content[k]; else content[k] = v;
      }
      return content as Content;
    };
    const env = target ?? "preview";
    return commit(t, env, { content: apply(repo.copyFor(t, env).content) }, { content: apply(t.preview.content) }, { expected: expected_version, note: note ?? noteFor(Object.keys(changes)), dry_run });
  });

  tool("edit_content", {
    title: "Precise edits", kind: "write",
    description: "Small edits by path, saved as one version. Pick a list item by its own field or position: \"hero.kicker\", \"schedule.slots[id=S3A].time\", \"quizzes[path=chem-exam].title\", \"hero.headline.0\". Ops: set (replace/create; \"list.-\" appends), merge (some fields of an object), upsert (path = a list: add the item, or replace the one with the same id/path), append, insert (at a list position), remove.",
    input: {
      slug: slugArg,
      operations: z.array(z.object({
        op: z.enum(["set", "merge", "upsert", "append", "insert", "remove"]),
        path: z.string(),
        value: z.unknown().optional(),
        by: z.string().optional().describe("upsert: the identifying field, if not id/path."),
      })).min(1),
      target: targetArg, expected_version: expectedArg, dry_run: dryRunArg,
      note: z.string().optional().describe("For the history."),
    },
  }, async ({ slug, operations, target, expected_version, dry_run, note }) => {
    const t = await repo.getTenant(slug);
    if (!t) return noTeacher(slug);
    const roots = operations.map((o) => o.path.split(/[.[]/)[0].trim());
    if (roots.includes("slug")) return fail("BAD_INPUT", "slug can't be changed.");
    const env = target ?? "preview";
    const ops = canonicalOps(repo.copyFor(t, env).content, operations as Op[]);
    const content = applyOps(repo.copyFor(t, env).content, ops);
    // A live edit is also made in the preview when it holds unpublished edits: by item id, never by position.
    const mirrored = env === "production" && t.preview.pending ? mirrorOps(t.content, t.preview.content, ops) : null;
    return commit(t, env, { content }, mirrored ? { content: mirrored.doc } : undefined, { expected: expected_version, note: note ?? noteFor(roots), dry_run, notSynced: mirrored?.skipped });
  });

  tool("update_theme", {
    title: "Change the look", kind: "write",
    description: "Colors, fonts and style options, merged over the current theme: pass only what changes (get_schema part \"theme\").",
    input: {
      slug: slugArg,
      theme: z.record(z.string(), z.unknown()).describe("e.g. { \"colors\": { \"accent\": \"#1e6bd6\" } }"),
      target: targetArg, expected_version: expectedArg, dry_run: dryRunArg,
    },
  }, async ({ slug, theme, target, expected_version, dry_run }) => {
    const t = await repo.getTenant(slug);
    if (!t) return noTeacher(slug);
    const env = target ?? "preview";
    return commit(t, env, { theme: deepMerge(repo.copyFor(t, env).theme, theme) }, { theme: deepMerge(t.preview.theme, theme) }, { expected: expected_version, note: "الهوية البصرية", dry_run });
  });

  tool("publish_preview", {
    title: "Publish or discard the preview", kind: "destructive",
    description: "publish: the live site becomes exactly what the private preview shows (all unpublished edits at once). discard: throw the unpublished preview edits away. Only after the user checked the preview and asked for it.",
    input: { slug: slugArg, action: z.enum(["publish", "discard"]) },
  }, async ({ slug, action }) => {
    const t = await repo.getTenant(slug);
    if (!t) return noTeacher(slug);
    if (!t.preview.pending) return ok({ nothing_to_do: true, note: "The preview has no unpublished edits." });
    if (action === "discard") { await repo.discardPreview(slug, actor); refreshTeacher(slug); return ok({ discarded: true, live: false }); }
    const changed = diff(t.content, t.preview.content).slice(0, 40).map((c) => c.path);
    const r = await repo.publishPreview(slug, actor);
    if (!r.ok) return r.reason === "invalid" ? refused(r.issues, { content: t.preview.content, theme: t.preview.theme }) : r.reason === "conflict" ? conflict(r.version, "preview") : noTeacher(slug);
    refreshTeacher(slug);
    return ok({ saved: "production", live: true, version: r.version, visible_at: siteUrl(slug, t.domains), changed });
  });

  tool("set_teacher_status", {
    title: "Put a site online or offline", kind: "destructive",
    description: "active = the site is online; disabled = every address of the teacher shows 'not found' (content is kept).",
    input: { slug: slugArg, status: z.enum(["active", "disabled"]) },
  }, async ({ slug, status }) => {
    if (!(await repo.getTenant(slug))) return noTeacher(slug);
    await repo.setTenantStatus(slug, status);
    refreshTeacher(slug);
    return ok({ slug, status, live: status === "active" });
  });

  tool("manage_plan", {
    title: "The teacher's plan", kind: "write",
    description: "The plan's bundles: read them (no changes), or enable / disable. A bundle that's off can be edited in the preview but not published. Turn on only what the teacher bought.",
    input: {
      slug: slugArg,
      enable: z.array(z.enum(FEATURES)).optional(),
      disable: z.array(z.enum(FEATURES)).optional(),
      max_forms: z.number().int().min(0).max(100).nullable().optional().describe("null = no limit."),
    },
  }, async ({ slug, enable, disable, max_forms }) => {
    const t = await repo.getTenant(slug);
    if (!t) return noTeacher(slug);
    const p = { ...t.permissions };
    for (const f of enable ?? []) p[f] = true;
    for (const f of disable ?? []) p[f] = false;
    if (max_forms !== undefined) p.maxForms = max_forms;
    const changed = Boolean(enable?.length || disable?.length || max_forms !== undefined);
    if (changed) { await repo.setPermissions(slug, p); refreshTeacher(slug); }
    return ok({ slug, changed, on: FEATURES.filter((f) => p[f]), off: FEATURES.filter((f) => !p[f]), max_forms: p.maxForms });
  });

  /* ----- images ----- */

  tool("create_upload_link", {
    title: "Upload image files", kind: "write",
    description: "For image files not on the internet. If you have the files and can run commands, upload them yourself: curl -F \"file=@photo.jpg\" \"<upload_url>\" (one file per request, under 4 MB); the reply gives the key. Otherwise send the user page_url to drop the photos, then list_images.",
    input: { slug: slugArg, hours: z.number().min(1).max(72).optional().describe("How long the link works. Default 24.") },
  }, async ({ slug, hours }) => {
    if (!SLUG_RE.test(slug)) return fail("BAD_INPUT", "Invalid slug.");
    const link = makeUploadLink(origin, slug, hours ?? 24);
    const upload = link.url.replace("/upload?", "/api/upload?");
    return ok({
      upload_url: upload, page_url: link.url, expires_at: link.expiresAt,
      upload_yourself: `curl -F "file=@/path/to/photo.jpg" "${upload}"`,
      reply: "{ results: [{ name, key, url } | { name, error }] }",
      limits: "One file per request, under 4 MB (resize a larger photo to about 2000px first). JPG, PNG, WEBP, GIF or AVIF.",
      tip: "File names are kept in the keys: name files meaningfully (teacher.jpg, book-cover.jpg, q3-diagram.png).",
    });
  });

  tool("upload_image", {
    title: "Upload an image from a link", kind: "write",
    description: "Stores an image from a public link (Google Drive/Dropbox share links work) or small base64 data; returns the key for image fields. JPG, PNG, WEBP, GIF, AVIF. For files on your machine use create_upload_link.",
    input: {
      slug: slugArg,
      source_url: z.string().url().optional(),
      data_base64: z.string().optional().describe("Raw base64 or a data: URL."),
      file_name: z.string().optional().describe("Readable name kept in the key, e.g. \"book-cover\"."),
    },
  }, async ({ slug, source_url, data_base64, file_name }) => {
    if (!SLUG_RE.test(slug)) return fail("BAD_INPUT", "Invalid slug.");
    if (!source_url === !data_base64) return fail("BAD_INPUT", "Give exactly one of source_url or data_base64.");
    let bytes: Uint8Array;
    try {
      bytes = source_url ? await fetchImage(source_url) : new Uint8Array(Buffer.from(data_base64!.replace(/^data:[^,]*,/, ""), "base64"));
    } catch (e) { return fail("BAD_INPUT", `Could not get the image: ${(e as Error).message}`, { fix: "Use a direct link to the image file, or create_upload_link." }); }
    const name = file_name ?? (source_url ? decodeURIComponent(new URL(source_url).pathname.split("/").pop() ?? "") : undefined);
    try {
      const stored = await storeImage(slug, bytes, undefined, name);
      return ok({ ...stored, url: abs(stored.url) });
    } catch (e) {
      if (e instanceof ImageError) return fail("BAD_INPUT", "Not an accepted image (JPG, PNG, WEBP, GIF, AVIF up to 20 MB).", { fix: source_url ? "If the link is a share page rather than the image itself, use a direct link or create_upload_link." : "Check the base64 data, or use create_upload_link." });
      throw e;
    }
  });

  tool("list_images", {
    title: "List uploaded images", kind: "read",
    description: "The teacher's uploaded images, newest first: key, URL, and whether the page uses it.",
    input: { slug: slugArg, limit: z.number().int().min(1).max(500).optional().describe("Default 40."), unused_only: z.boolean().optional() },
  }, async ({ slug, limit, unused_only }) => {
    const [files, t] = await Promise.all([listObjects(slug, "uploads"), repo.getTenant(slug)]);
    const used = new Set(t ? [...usedImages(t.content), ...usedImages(t.preview.content)] : []);
    const rows = files.map((f) => ({ ...f, url: abs(assetUrl(slug, f.key)), used: used.has(f.key) })).filter((f) => !unused_only || !f.used);
    const n = limit ?? 40;
    return ok({ total: rows.length, images: rows.slice(0, n), ...(rows.length > n ? { more: rows.length - n } : {}) });
  });

  tool("view_image", {
    title: "Look at an image", kind: "read",
    description: "Returns an uploaded image so you can see it (to decide where it goes, or to write alt text).",
    input: { slug: slugArg, key: z.string().describe("Key from list_images, e.g. \"uploads/…webp\".") },
  }, async ({ slug, key }) => {
    if (key.includes("..") || key.startsWith("/")) return fail("BAD_INPUT", "Invalid key.");
    const bytes = await getObject(slug, key);
    if (!bytes) return fail("NOT_FOUND", `No image "${key}" for ${slug}.`, { fix: "list_images shows the keys." });
    const type = sniffImage(bytes);
    if (!type) return fail("BAD_INPUT", "That file is not an image.");
    if (bytes.byteLength > 3 * 1024 * 1024) return ok({ key, url: abs(assetUrl(slug, key)), note: "Too large to show here (over 3 MB); open the URL." });
    return { content: [{ type: "image", data: Buffer.from(bytes).toString("base64"), mimeType: type }, { type: "text", text: abs(assetUrl(slug, key)) }] };
  });

  /* ----- domains and logins ----- */

  tool("manage_domain", {
    title: "Domains", kind: "destructive",
    description: "add / remove / make_primary a custom domain. The primary one is what Google indexes. After adding, the domain must also be added in Vercel (Settings → Domains) and its DNS set at the registrar.",
    input: { slug: slugArg, action: z.enum(["add", "remove", "make_primary"]), domain: z.string().describe("e.g. \"mohamedali.com\"") },
  }, async ({ slug, action, domain }) => {
    if (!(await repo.getTenant(slug))) return noTeacher(slug);
    const d = normalizeDomain(domain);
    if (action === "add") {
      if (!repo.DOMAIN_RE.test(d)) return fail("BAD_INPUT", "Not a valid domain, e.g. mohamedali.com");
      if (isPlatformHost(d, env.rootDomain, env.platformHosts)) return fail("BAD_INPUT", "That domain is reserved for the platform.");
      try { await repo.addDomain(slug, d); } catch { return fail("BAD_INPUT", "That domain is already used by a site."); }
    } else if (action === "remove") await repo.removeDomain(slug, d);
    else await repo.makePrimaryDomain(slug, d);
    refreshTeacher(slug, true);
    return ok({ slug, domains: (await repo.getTenant(slug))?.domains, ...(action === "add" ? { next: `Add ${d} in Vercel → Settings → Domains and set the DNS records it shows.` } : {}) });
  });

  const absoluteLogin = async (slug: string) => {
    const u = await loginUrlFor(slug);
    return u.startsWith("/") ? `${origin}${u}` : u;
  };

  tool("manage_login", {
    title: "Teacher logins", kind: "destructive",
    description: "list / create / reset_password / disable / enable / delete a login for the teacher's own admin panel. create and reset_password return a new password ONCE: give it to the user with the login link.",
    input: {
      slug: slugArg,
      action: z.enum(["list", "create", "reset_password", "disable", "enable", "delete"]),
      username: z.string().optional().describe("For everything except list. 3-32 lowercase letters, digits, . _ -"),
    },
  }, async ({ slug, action, username }) => {
    if (!(await repo.getTenant(slug))) return noTeacher(slug);
    if (action === "list") return ok(await repo.listUsers(slug));
    const name = (username ?? "").trim().toLowerCase();
    if (!USERNAME_RE.test(name)) return fail("BAD_INPUT", "username: 3-32 lowercase English letters, digits, . _ -");
    if (action === "create") {
      const password = generatePassword();
      try { await repo.createUser(slug, name, await hashPassword(password)); } catch { return fail("BAD_INPUT", "That username is taken.", { fix: "Pick another username." }); }
      return ok({ username: name, password, login_url: await absoluteLogin(slug), note: "Shown once." });
    }
    const user = (await repo.listUsers(slug)).find((u) => u.username === name);
    if (!user) return fail("NOT_FOUND", `No login "${name}" for ${slug}.`, { fix: "manage_login with action list shows them." });
    if (action === "reset_password") {
      const password = generatePassword();
      await repo.updateUser(slug, user.id, { passwordHash: await hashPassword(password), mustChangePassword: true });
      return ok({ username: name, password, login_url: await absoluteLogin(slug), note: "Shown once." });
    }
    if (action === "delete") await repo.deleteUser(slug, user.id);
    else await repo.updateUser(slug, user.id, { disabled: action === "disable" });
    return ok({ username: name, done: action });
  });

  /* ----- games and site files ----- */

  tool("upload_game", {
    title: "Upload a game file", kind: "write",
    description: "Stores a learning game (one self-contained HTML file, max 3 MB) and returns its key for games[].file. To change a game, upload again. Rules: get_guide \"library\".",
    input: {
      slug: slugArg,
      html: z.string().describe("The whole HTML document."),
      file_name: z.string().optional().describe("Readable name, e.g. \"atoms-game.html\"."),
    },
  }, async ({ slug, html, file_name }) => {
    if (Buffer.byteLength(html) > MAX_GAME_BYTES) return fail("BAD_INPUT", `The game is over ${MAX_GAME_BYTES / 1024 / 1024} MB.`, { fix: "Load libraries from a CDN and shrink inline images." });
    try {
      const saved = await saveGameFile(slug, file_name ?? "game.html", html, actor);
      return ok({ ...saved, next: "Set content games[].file to this key, e.g. edit_content upsert on \"games\"." });
    } catch (e) {
      if (e instanceof GameFileError) return fail("BAD_INPUT", e.message);
      throw e;
    }
  });

  tool("list_game_files", {
    title: "List game files", kind: "read",
    description: "The teacher's uploaded game files (key, name, size, when, by whom), newest first, and which games use each.",
    input: { slug: slugArg },
  }, async ({ slug }) => {
    const t = await repo.getTenant(slug);
    if (!t) return noTeacher(slug);
    const used = new Map<string, string[]>();
    for (const [env, games] of [["production", t.content.games], ["preview", t.preview.content.games]] as const) {
      for (const g of games) if (g.file) used.set(g.file, [...(used.get(g.file) ?? []), `${env}: ${g.path}`]);
    }
    return ok((await listGameFiles(slug)).map((f) => ({ ...f, usedBy: used.get(f.key) ?? [] })));
  });

  tool("manage_site_files", {
    title: "Site files (verification)", kind: "destructive",
    description: "Small text files at the root of the teacher's site: search-engine verification files, ads.txt, .well-known/…",
    input: {
      slug: slugArg,
      action: z.enum(["list", "put", "delete"]),
      name: z.string().optional().describe("e.g. \"google8dd000c502756500.html\""),
      content: z.string().optional().describe("Up to 64 KB."),
    },
  }, async ({ slug, action, name, content }) => {
    const t = await repo.getTenant(slug);
    if (!t) return noTeacher(slug);
    const at = (n: string) => `${siteUrl(slug, t.domains)}/${n}`;
    if (action === "list") return ok((await listSiteFiles(slug)).map((f) => ({ ...f, url: at(f.name) })));
    if (!name) return fail("BAD_INPUT", "name is required.");
    try {
      if (action === "put") {
        if (content === undefined) return fail("BAD_INPUT", "content is required for put.");
        const saved = await putSiteFile(slug, name, content, actor);
        revalidateTag(filesTag(slug), { expire: 0 });
        return ok({ saved, url: at(saved) });
      }
      await deleteSiteFile(slug, name.replace(/^\/+/, ""));
      revalidateTag(filesTag(slug), { expire: 0 });
      return ok({ deleted: name });
    } catch (e) {
      if (e instanceof SiteFileError) return fail("BAD_INPUT", e.message);
      throw e;
    }
  });

  /* ----- form requests ----- */

  tool("list_requests", {
    title: "Form requests", kind: "read",
    description: "What students sent through form buttons, newest first: answers, what the button carried, status; plus totals per status.",
    input: {
      slug: slugArg,
      form: z.string().optional().describe("Only this form id."),
      status: z.enum(STATUSES).optional(),
      search: z.string().optional().describe("Part of a name or phone."),
      limit: z.number().int().min(1).max(500).optional().describe("Default 25."),
      offset: z.number().int().min(0).optional(),
      env: envArg,
    },
  }, async ({ slug, form, status, search, limit, offset, env }) => {
    const n = limit ?? 25;
    const r = await listSubmissions(slug, { env, form, status, q: search, limit: n, offset: offset ?? 0 });
    const shown = (offset ?? 0) + r.rows.length;
    return ok({ total: r.total, counts: r.counts, rows: r.rows, ...(shown < r.total ? { next_offset: shown } : {}) });
  });

  tool("update_requests", {
    title: "Mark requests", kind: "write",
    description: "Set the status of requests (ids from list_requests): new, contacted, done.",
    input: { slug: slugArg, ids: z.array(z.number().int()).min(1), status: z.enum(STATUSES) },
  }, async ({ slug, ids, status }) => { await setStatus(slug, ids, status); return ok({ updated: ids.length, status }); });

  /* ----- quizzes ----- */

  type QuizT = Content["quizzes"][number];
  async function quizOf(slug: string, path: string, env: SiteEnv): Promise<{ error: CallToolResult } | { quiz: QuizT; form: Content["forms"][number] | undefined }> {
    const t = await repo.getTenant(slug);
    if (!t) return { error: noTeacher(slug) };
    const quiz = repo.copyFor(t, env).content.quizzes.find((q) => q.path === path);
    if (!quiz) {
      const have = repo.copyFor(t, env).content.quizzes.map((q) => q.path);
      return { error: fail("NOT_FOUND", `No quiz "${path}" in the ${env} copy of ${slug}.`, { fix: have.length ? `Quizzes there: ${have.join(", ")}.` : "There are no quizzes there yet." }) };
    }
    return { quiz, form: quiz.form ? t.content.forms.find((f) => f.id === quiz.form) : undefined };
  }
  const finished = (r: AttemptRow) => r.status !== "in_progress";
  const short = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n)}…` : s ?? "");

  tool("quiz_results", {
    title: "Quiz results", kind: "read",
    description: "summary (default): the quiz's numbers (started, finished, scores, pass rate, per-question correct rate, grades waiting). attempts: one short row per student, paged; include adds answers, form fields or marks. needs_grading: finished attempts not approved yet, with only the written answers that have no answer key.",
    input: {
      slug: slugArg,
      path: z.string().describe("The quiz's path (content.quizzes[].path)."),
      view: z.enum(["summary", "attempts", "needs_grading"]).optional(),
      status: z.enum(["submitted", "timed_out", "in_progress"]).optional(),
      include: z.array(z.enum(["answers", "form", "marks"])).optional(),
      limit: z.number().int().min(1).max(200).optional().describe("Default 25."),
      offset: z.number().int().min(0).optional(),
      env: envArg,
    },
  }, async ({ slug, path, view, status, include, limit, offset, env }) => {
    const e = env ?? "production";
    const q = await quizOf(slug, path, e);
    if ("error" in q) return q.error;
    const { quiz, form } = q;
    const rows = await listAttempts(slug, quiz, e, form);
    const n = limit ?? 25, from = offset ?? 0;
    const page = <T,>(all: T[]) => ({ total: all.length, rows: all.slice(from, from + n), ...(from + n < all.length ? { next_offset: from + n } : {}) });
    const waiting = rows.filter((r) => finished(r) && !r.approvedAt);
    const written = quiz.questions.map((x, i) => ({ x, i })).filter(({ x }) => x.correct.length === 0);

    if (view === "attempts") {
      const want = new Set(include ?? []);
      const p = page(rows.filter((r) => !status || r.status === status));
      return ok({
        quiz: path, ...p,
        rows: p.rows.map((r) => ({
          id: r.id, status: r.status, name: r.student.name, phone: r.student.phone,
          auto: r.graded.max ? `${r.graded.score}/${r.graded.max}` : null, percent: r.graded.percent, seconds: r.seconds,
          grade: r.result?.score ?? null, approved: Boolean(r.approvedAt), ...(r.result?.note ? { note: r.result.note } : {}), ...(r.ref ? { ref: r.ref } : {}),
          ...(want.has("answers") ? { answers: r.answers } : {}), ...(want.has("form") ? { form: r.fields } : {}), ...(want.has("marks") ? { marks: r.graded.marks } : {}),
        })),
      });
    }
    if (view === "needs_grading") {
      const p = page(waiting);
      return ok({
        quiz: path, full_mark: quiz.questions.reduce((a, x) => a + x.points, 0),
        written_questions: written.map(({ x, i }) => ({ index: i, text: x.text ?? "", points: x.points, ...(x.image ? { image: x.image } : {}) })),
        ...p,
        rows: p.rows.map((r) => ({
          attempt: r.id, name: r.student.name, status: r.status,
          auto: r.graded.max ? `${r.graded.score}/${r.graded.max}` : null,
          written: Object.fromEntries(written.map(({ i }) => [i, r.answers[String(i)] ?? ""])),
          ...(r.result ? { draft: { score: r.result.score, note: r.result.note } } : {}),
        })),
        next: written.length
          ? "Grade the written answers, add the automatic marks, then grade_quiz with grades: [{attempt, score, note}] for all of them in one call."
          : "Every question has an answer key: grade_quiz with action approve_all publishes the automatic scores.",
      });
    }
    const m = quizMetrics(quiz, rows);
    return ok({
      quiz: { path, title: quiz.title, state: quiz.state, questions: quiz.questions.length, written_questions: written.length },
      metrics: { ...m, questions: m.questions.map((x) => ({ ...x, text: short(x.text, 60) })) },
      grading: { finished: rows.filter(finished).length, approved: rows.filter((r) => r.approvedAt).length, waiting: waiting.length },
      next: "view \"attempts\" lists students; view \"needs_grading\" lists what to grade.",
    });
  });

  tool("poll_results", {
    title: "Vote results", kind: "read",
    description: "Anonymous votes (content.polls, each on its own page): whether each is open, when its countdown ends, and the votes per choice. Nothing about voters is stored.",
    input: { slug: slugArg, env: envArg },
  }, async ({ slug, env }) => {
    const t = await repo.getTenant(slug);
    if (!t) return noTeacher(slug);
    const e = env ?? "production";
    const polls = repo.copyFor(t, e).content.polls;
    return ok(await Promise.all(polls.map(async (p) => {
      const r = await pollResultsFor(slug, e, p);
      const { end } = pollTimes(p);
      return { path: p.path, title: p.title, status: pollStatus(p), endsAt: end ? new Date(end).toISOString() : null, total: r.total, choices: p.choices.map((c, i) => ({ label: c.label, votes: r.counts[i] })) };
    })));
  });

  tool("grade_quiz", {
    title: "Grade quiz attempts", kind: "write",
    description: "grade: grades for finished attempts, many in one call: grades [{attempt, score, note? (the student sees it), name?, phone?}]. approve true (default) publishes each grade where the student looks it up by name and phone; false keeps a draft. approve_all: approves every finished attempt with its automatic score or draft grade.",
    input: {
      slug: slugArg,
      path: z.string().describe("The quiz's path."),
      action: z.enum(["grade", "approve_all"]),
      grades: z.array(z.object({
        attempt: z.number().int(),
        score: z.union([z.string(), z.number()]).optional(),
        note: z.string().optional(),
        name: z.string().optional(),
        phone: z.string().optional(),
      })).max(300).optional(),
      approve: z.boolean().optional().describe("Default true."),
      env: envArg,
    },
  }, async (a) => {
    const e = a.env ?? "production";
    const q = await quizOf(a.slug, a.path, e);
    if ("error" in q) return q.error;
    const { quiz, form } = q;
    await examResults.ensureQuizResultSets(a.slug, [quiz]);
    try {
      if (a.action === "approve_all") {
        const n = await approveAll(a.slug, quiz, e, form, actor);
        refreshTeacher(a.slug);
        return ok({ approved: n });
      }
      if (!a.grades?.length) return fail("BAD_INPUT", "grades is required: [{ attempt, score, note? }].", { fix: "quiz_results view \"needs_grading\" lists the attempts." });
      const rows = new Map((await listAttempts(a.slug, quiz, e, form)).map((r) => [r.id, r]));
      const approve = a.approve ?? true;
      const failed: { attempt: number; error: string }[] = [];
      let graded = 0;
      for (const g of a.grades) {
        const r = rows.get(g.attempt);
        if (!r) { failed.push({ attempt: g.attempt, error: "No such attempt for this quiz." }); continue; }
        try {
          await reviewAttempt(a.slug, quiz.path, r.id, {
            name: g.name ?? r.result?.name ?? r.student.name, phone: g.phone ?? r.result?.phone ?? r.student.phone,
            score: g.score ?? r.result?.score ?? (r.graded.max ? r.graded.score : ""), note: g.note ?? r.result?.note,
          }, approve, actor);
          graded++;
        } catch (err) {
          if (!(err instanceof GradeError)) throw err;
          failed.push({ attempt: g.attempt, error: err.message });
        }
      }
      if (graded) refreshTeacher(a.slug);
      return ok({ graded, approved: approve, ...(failed.length ? { failed } : {}) });
    } catch (err) {
      if (err instanceof GradeError) return fail("BAD_INPUT", err.message);
      throw err;
    }
  });

  /* ----- exam results ----- */

  tool("exam_results", {
    title: "Exam results", kind: "read",
    description: "Without id: every exam's results (title, date, full mark, published, students, how many looked theirs up; quizPath = an online quiz's own results, filled by approved grades). With id: also its rows {name, phone, score, note}.",
    input: { slug: slugArg, id: z.number().int().optional() },
  }, async ({ slug, id }) => {
    if (id === undefined) return ok(await examResults.listResultSets(slug));
    const set = await examResults.getResultSet(slug, id);
    return set ? ok(set) : fail("NOT_FOUND", `No exam results ${id} for ${slug}.`, { fix: "exam_results without id lists them." });
  });

  tool("manage_exam_results", {
    title: "Manage exam results", kind: "destructive",
    description: "Results typed by hand. create (title, date, total?, exam_id?, rows?) → id; add_rows (mode merge = update students already there by phone + first name; replace = start over); update; delete. Published results show in the site's past exams; a student sees only their own row.",
    input: {
      slug: slugArg,
      action: z.enum(["create", "add_rows", "update", "delete"]),
      id: z.number().int().optional(),
      title: z.string().optional(),
      date: z.string().optional().describe("YYYY-MM-DD"),
      total: z.string().optional().describe("Full mark, e.g. \"50\"."),
      exam_id: z.string().optional(),
      published: z.boolean().optional(),
      preview_published: z.boolean().optional(),
      rows: z.array(z.object({ name: z.string(), phone: z.string(), score: z.union([z.string(), z.number()]), note: z.string().optional() })).optional(),
      mode: z.enum(["merge", "replace"]).optional(),
    },
  }, async (a) => {
    try {
      if (a.action === "create") {
        const id = await examResults.createResultSet(a.slug, { examId: a.exam_id, title: a.title, date: a.date, total: a.total }, actor);
        if (a.rows?.length) await examResults.importRows(a.slug, id, a.rows, "merge", actor);
        if (a.published) await examResults.updateResultMeta(a.slug, id, { published: true }, actor);
        if (a.published) refreshTeacher(a.slug);
        return ok({ created: id, live: Boolean(a.published), ...(await examResults.getResultSet(a.slug, id).then((s) => ({ students: s?.rows.length ?? 0 }))) });
      }
      if (a.id === undefined) return fail("BAD_INPUT", "id is required.", { fix: "exam_results lists the ids." });
      if (a.action === "add_rows") {
        if (!a.rows?.length) return fail("BAD_INPUT", "rows is required.");
        const r = await examResults.importRows(a.slug, a.id, a.rows, a.mode ?? "merge", actor);
        return ok({ ...r.summary, students: r.count });
      }
      if (a.action === "update") {
        await examResults.updateResultMeta(a.slug, a.id, { title: a.title, date: a.date, total: a.total, published: a.published, previewPublished: a.preview_published }, actor);
        refreshTeacher(a.slug);
        return ok({ updated: a.id });
      }
      await examResults.deleteResultSet(a.slug, a.id);
      refreshTeacher(a.slug);
      return ok({ deleted: a.id });
    } catch (e) {
      if (e instanceof examResults.ResultsError) return fail("BAD_INPUT", e.message);
      throw e;
    }
  });

  /* ----- history and analytics ----- */

  tool("list_revisions", {
    title: "History", kind: "read",
    description: `Versions that can be restored, newest first: who, when, what, which copy. Kept ${repo.REVISION_DAYS} days, plus each copy's state from before that (starting_point).`,
    input: { slug: slugArg, limit: z.number().int().min(1).max(200).optional().describe("Default 20.") },
  }, async ({ slug, limit }) => ok({
    kept_days: repo.REVISION_DAYS,
    revisions: (await repo.listRevisions(slug, limit ?? 20)).map(({ startingPoint, ...r }) => ({ ...r, ...(startingPoint ? { starting_point: true } : {}) })),
  }));

  tool("restore_revision", {
    title: "Undo to a version", kind: "destructive",
    description: "Brings a copy back to a saved version (a production version to the live site, a preview one to the preview), as a new version.",
    input: { slug: slugArg, revision_id: z.number().int().describe("id from list_revisions") },
  }, async ({ slug, revision_id }) => {
    const t = await repo.getTenant(slug);
    if (!t) return noTeacher(slug);
    const rev = (await repo.listRevisions(slug, 5000)).find((r) => r.id === revision_id);
    if (!rev) return fail("REVISION_GONE", `Version ${revision_id} can't be restored: versions are kept for ${repo.REVISION_DAYS} days and then deleted.`, { fix: "list_revisions shows what can still be restored." });
    const r = await repo.restoreRevision(slug, revision_id, actor);
    if (!r.ok) return r.reason === "invalid" ? refused(r.issues, {}) : r.reason === "conflict" ? conflict(r.version, rev.env) : fail("REVISION_GONE", `Version ${revision_id} is gone.`);
    refreshTeacher(slug);
    const site = siteUrl(slug, t.domains);
    return ok(rev.env === "preview"
      ? { restored: revision_id, saved: "preview", live: false, preview_version: r.version, visible_at: `${site}/preview`, publish_with: "publish_preview" }
      : { restored: revision_id, saved: "production", live: true, version: r.version, visible_at: site });
  });

  tool("get_analytics", {
    title: "Visits and conversions", kind: "read",
    description: "Visitors, page views, visitors who contacted the teacher or went to their channels, clicks by destination and place, sections reached, time on page, devices, sources. daily adds the last 30 days.",
    input: { slug: slugArg, range: z.enum(RANGES).optional().describe("today | month (default) | lastMonth | all"), daily: z.boolean().optional(), env: envArg },
  }, async ({ slug, range, daily, env }) => {
    const r = await report(slug, range ?? "month", env ?? "production");
    if (!r) return fail("NOT_FOUND", "No analytics: unknown teacher or no database.");
    if (daily) return ok(r);
    const { daily: _days, ...rest } = r;
    return ok(rest);
  });

  /* ----- reference material and ready-made workflows ----- */

  for (const topic of GUIDE_TOPICS) {
    server.registerResource(`guide-${topic}`, `myostaz://guide/${topic}`, { title: GUIDE_TITLES[topic], description: `How to: ${GUIDE_TITLES[topic]}`, mimeType: "text/plain" },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/plain", text: GUIDES[topic] }] }));
  }
  server.registerResource("schema-part", new ResourceTemplate("myostaz://schema/{part}", {
    list: async () => ({ resources: contentOutline().map((p) => ({ uri: `myostaz://schema/${p.key}`, name: `schema-${p.key}`, title: `Schema: ${p.key}`, mimeType: "application/json" })) }),
  }), { title: "Content schema", description: "JSON schema of one top-level content key, with the admin panel's labels and hints.", mimeType: "application/json" },
  async (uri, { part }) => {
    const s = schemaFor(String(part));
    if (!s) throw new Error(`Unknown part "${String(part)}".`);
    return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(s) }] };
  });

  for (const p of PROMPTS) {
    if (p.super && scope.kind !== "super") continue;
    const argsSchema = Object.fromEntries(p.args.map((a) => [a.name, (a.required ? z.string() : z.string().optional()).describe(a.description)]));
    const prompt = server.registerPrompt.bind(server) as unknown as (name: string, config: unknown, cb: (args: Record<string, string | undefined>) => unknown) => unknown;
    prompt(p.name, { title: p.title, description: p.description, ...(p.args.length ? { argsSchema } : {}) },
      (args) => ({ messages: [{ role: "user", content: { type: "text", text: p.text(args ?? {}) } }] }));
  }

  return server;
}
