import "server-only";
import { revalidateTag } from "next/cache";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { env } from "@/lib/env";
import { isPlatformHost } from "@/lib/routing";
import { ContentSchema, ThemeSchema, type Content, type Theme } from "@/lib/schema";
import { IMAGE_PATHS, mapImages, validate } from "@/lib/content-utils";
import * as repo from "../repo";
import { DOMAINS_TAG, tenantTag } from "../site";
import { assetBase, assetUrl } from "../assets";
import { listBundled, readBundledJson } from "../bundled";
import { getObject, listObjects } from "../storage";
import { generatePassword, hashPassword } from "../passwords";
import { ImageError, SLUG_RE, USERNAME_RE, loginUrlFor, normalizeDomain, sniffImage, storeImage } from "../admin-ops";
import { makeUploadLink } from "../upload-link";
import { RANGES, report } from "../analytics";
import { STATUSES, listSubmissions, setStatus } from "../submissions";
import { applyOps, contentOutline, deepMerge, schemaFor, type Op } from "./content-ops";
import { fetchImage } from "./fetch-image";

const AUTHOR = "Claude (MCP)";

const INSTRUCTIONS = `portfolioIO hosts one marketing page per teacher (mostly Arabic, right-to-left, Egypt). Every button opens a chat (usually WhatsApp) with a pre-written message, so students only press send. These tools do everything the admin panel does, directly on the live database. Every save is validated like the admin forms, keeps a full revision (restore_revision undoes it), and is live within seconds.

Onboarding a new teacher:
1. get_schema (no args) for the outline of a page; get_schema with a key ("hero", "schedule"...) for its exact fields; get_example to see a complete real page.
2. Gather the facts from the user: name, subjects and grades, schedule (days, times, areas/centers), WhatsApp number, book, exams, socials, YouTube. Never invent facts (prices, phone numbers, results, follower counts, dates): ask, or leave the optional field out.
3. Photos: call create_upload_link and send the user the link (they drop the photos from phone or computer), or use upload_image with public links (Google Drive/Dropbox share links work). Then list_images and view_image to see each photo and decide where it goes (teacher photo, logo, book cover, gallery...). Image fields take the returned key (e.g. "uploads/...-teacher.jpg").
4. create_teacher with the full content (and optionally a theme), or with copy_from and then edit_content to replace everything that belongs to the other teacher (all text, numbers, images, links).
5. Send the user preview_url to review; adjust with edit_content (small changes) or update_content (whole sections).
6. When ready: manage_domain (also add the domain in Vercel → Settings → Domains), manage_login to create the teacher's account (the password is shown once; pass it to the user).

Forms: any WhatsApp button can open a form instead (the student leaves name/phone/etc. for the teacher). Define forms in content "forms" (get_schema part "forms"), then set "form": "<form id>" on the button (hero.primaryCta, navCta, sticky.cta, final.cta, students.cta, schedule.form, book.order.form, exams.items[].form, challenge.form, services/popup cta.form). Fields with remember=true (name, phone) are asked once per device; the button's own details (challenge answer, chosen group, exam) are attached automatically. Submissions: list_requests / update_requests.

Rules for content: match the tone and language of the example (Egyptian Arabic) unless told otherwise. WhatsApp numbers are international digits only (2010...). "sections" is the page order and every listed section needs its data. Messages may use placeholders listed in each field's description (e.g. {grade}, {date}). Pass expected_version from get_teacher when editing, so a change made meanwhile in the admin panel isn't overwritten.`;

/* ------------------------------------------------------------------ */

const ok = (data: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (message: string, data?: unknown): CallToolResult => ({ isError: true, content: [{ type: "text", text: data === undefined ? message : `${message}\n${JSON.stringify(data, null, 2)}` }] });

function refreshTeacher(slug: string, domains = false) {
  revalidateTag(tenantTag(slug), { expire: 0 });
  if (domains) revalidateTag(DOMAINS_TAG, { expire: 0 });
}

const slugArg = z.string().describe("Teacher id (slug), e.g. \"mohamed-ali\". See list_teachers.");

/** Wraps a tool so thrown errors come back as readable tool errors instead of protocol failures. */
const safe = <A,>(fn: (args: A) => Promise<CallToolResult>) =>
  async (args: A): Promise<CallToolResult> => {
    try { return await fn(args); } catch (e) {
      if (e instanceof repo.ReadOnlyError) return fail("No database is connected (DATABASE_URL), so nothing can be saved.");
      console.error("mcp", e);
      return fail(e instanceof Error ? e.message : "Unexpected error.");
    }
  };

function saveResult(r: repo.SaveResult, slug: string, origin: string) {
  if (r.ok) { refreshTeacher(slug); return ok({ saved: true, version: r.version, preview_url: `${origin}/t/${slug}` }); }
  if (r.reason === "invalid") return fail("Not saved: the content doesn't pass validation. Fix these fields and try again.", r.issues);
  if (r.reason === "conflict") return fail(`Not saved: the page changed meanwhile (now version ${r.version}). Read it again with get_teacher and redo the change.`);
  return fail("Teacher not found.");
}

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

/* ------------------------------------------------------------------ */

export function buildMcpServer(origin: string): McpServer {
  const server = new McpServer({ name: "portfolioio", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  const preview = (slug: string) => `${origin}/t/${slug}`;
  // Local development serves files from /local-assets; make every link absolute.
  const abs = (url: string) => (url.startsWith("/") ? `${origin}${url}` : url);

  /* ----- reading ----- */

  server.registerTool("list_teachers", {
    title: "List teachers",
    description: "Every teacher on the platform with status, domains, logins count and links.",
    annotations: { readOnlyHint: true },
  }, safe(async () => {
    const all = await repo.listTenants();
    return ok(all.map((t) => ({ ...t, preview_url: preview(t.slug), admin_url: `${origin}/t/${t.slug}/admin` })));
  }));

  server.registerTool("get_teacher", {
    title: "Get a teacher's page",
    description: "The teacher's full content (as stored: image fields hold keys, resolved against image_base), theme, version, status, domains and logins. Pass keys to fetch only some top-level content keys.",
    inputSchema: { slug: slugArg, keys: z.array(z.string()).optional().describe("Only these top-level content keys, e.g. [\"hero\",\"schedule\"]. Add \"theme\" to include the theme.") },
    annotations: { readOnlyHint: true },
  }, safe(async ({ slug, keys }) => {
    const t = await repo.getTenant(slug);
    if (!t) return fail(`No teacher "${slug}". See list_teachers.`);
    const content = keys?.length ? Object.fromEntries(keys.filter((k) => k in t.content).map((k) => [k, (t.content as Record<string, unknown>)[k]])) : t.content;
    return ok({
      slug: t.slug, name: t.name, status: t.status, version: t.version, updated_at: t.updatedAt, updated_by: t.updatedBy,
      domains: t.domains, logins: await repo.listUsers(slug),
      preview_url: preview(slug), image_base: abs(assetBase(slug)),
      content, ...(keys?.length && !keys.includes("theme") ? {} : { theme: t.theme }),
    });
  }));

  server.registerTool("get_schema", {
    title: "Page structure",
    description: "Without part: the outline of a teacher page (every top-level content key, label, required or optional). With part: the exact JSON schema of that key (or \"theme\"), with the admin panel's labels and hints.",
    inputSchema: { part: z.string().optional().describe("A top-level content key such as \"hero\", \"schedule\", \"exams\", \"popup\", or \"theme\".") },
    annotations: { readOnlyHint: true },
  }, safe(async ({ part }) => {
    if (!part) return ok({ outline: contentOutline(), note: "\"sections\" lists the visible sections in page order; each listed section needs its data. Other keys (profile, contact, socials, nav, sticky, footer, labels, seo, popup) are page-wide.", image_fields: IMAGE_PATHS.map((p) => p.join(".").replaceAll(".[]", "[]")) });
    const s = schemaFor(part);
    return s ? ok(s) : fail(`Unknown part "${part}". Call get_schema without arguments for the list.`);
  }));

  server.registerTool("get_example", {
    title: "Example content",
    description: "A complete real page to learn the structure and tone from. Image values point to the example teacher's files and must be replaced for a new teacher.",
    inputSchema: {
      key: z.string().optional().describe("One top-level key only, e.g. \"schedule\". Omit for the whole page."),
      from: z.string().optional().describe("Teacher to take the example from. Defaults to the first bundled teacher."),
    },
    annotations: { readOnlyHint: true },
  }, safe(async ({ key, from }) => {
    const src = from ?? listBundled()[0] ?? (await repo.listTenants())[0]?.slug;
    const tpl = src ? await templateContent(src) : null;
    if (!tpl) return fail("No example teacher available.");
    const content = mapImages(tpl.content, (v) => abs(assetUrl(src!, v)));
    if (key) {
      if (key === "theme") return ok({ source: tpl.source, theme: tpl.theme });
      if (!(key in content)) return fail(`The example has no "${key}".`);
      return ok({ source: tpl.source, [key]: (content as Record<string, unknown>)[key] });
    }
    return ok({ source: tpl.source, content, theme: tpl.theme });
  }));

  /* ----- creating and editing ----- */

  server.registerTool("create_teacher", {
    title: "Create a teacher",
    description: "Creates a new teacher page. Give the full content (built from get_schema/get_example), or copy_from an existing teacher and then replace everything with edit_content. The page is live at preview_url right away (active) unless active is false.",
    inputSchema: {
      slug: z.string().describe("New id: lowercase English letters, digits and dashes, e.g. \"ahmed-hassan\". Used in links and file folders; can't be changed later."),
      name: z.string().describe("Teacher's display name (Arabic is fine), also written to profile.name."),
      content: z.record(z.string(), z.unknown()).optional().describe("Full content object (same shape as get_teacher's content). slug is filled in automatically."),
      copy_from: z.string().optional().describe("Start from this teacher's content instead (images keep pointing at their files until replaced)."),
      theme: z.record(z.string(), z.unknown()).optional().describe("Theme; merged over the copied/default theme, so only the changed parts are needed (e.g. {colors:{accent:\"#1e6bd6\"}})."),
      active: z.boolean().optional().describe("false = created hidden (status disabled). Default true."),
    },
  }, safe(async ({ slug, name, content, copy_from, theme, active }) => {
    if (!SLUG_RE.test(slug)) return fail("slug: lowercase English letters, digits and dashes only (2-50 chars).");
    if (await repo.getTenant(slug)) return fail(`A teacher "${slug}" already exists. Use edit_content / update_content.`);
    const fallback = copy_from ?? listBundled()[0] ?? (await repo.listTenants())[0]?.slug;
    const base = fallback ? await templateContent(fallback) : null;
    if (!content && !(copy_from && base)) return fail("Give content, or copy_from an existing teacher.");
    let draft = content
      ? (content as unknown as Content)
      : mapImages(base!.content, (v) => assetUrl(copy_from!, v));
    draft = { ...draft, slug, profile: { ...(draft.profile ?? {}), name } } as Content;
    const th = deepMerge(base?.theme ?? ({} as Theme), theme ?? {});
    const vc = validate(ContentSchema, draft);
    if (!vc.ok) return fail("Not created: the content doesn't pass validation.", vc.issues);
    const vt = validate(ThemeSchema, th);
    if (!vt.ok) return fail("Not created: the theme doesn't pass validation.", vt.issues);
    await repo.createTenant({ slug, name, content: vc.data, theme: vt.data, author: AUTHOR });
    if (active === false) await repo.setTenantStatus(slug, "disabled");
    refreshTeacher(slug, true);
    return ok({ created: true, slug, version: 1, status: active === false ? "disabled" : "active", preview_url: preview(slug), admin_url: `${origin}/t/${slug}/admin` });
  }));

  server.registerTool("update_content", {
    title: "Replace whole content keys",
    description: "Replaces whole top-level content keys (e.g. the full \"schedule\" or \"hero\" object) in one save. A key set to null is removed (optional keys only; remove it from \"sections\" too).",
    inputSchema: {
      slug: slugArg,
      changes: z.record(z.string(), z.unknown()).describe("{ key: newValue | null }, e.g. { \"exams\": {...}, \"popup\": null }."),
      expected_version: z.number().int().optional().describe("Version from get_teacher; the save is refused if the page changed since."),
      note: z.string().optional().describe("Short description for the history (Arabic or English)."),
    },
  }, safe(async ({ slug, changes, expected_version, note }) => {
    const t = await repo.getTenant(slug);
    if (!t) return fail(`No teacher "${slug}".`);
    if ("slug" in changes) return fail("slug can't be changed.");
    const content = { ...t.content } as Record<string, unknown>;
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) delete content[k]; else content[k] = v;
    }
    const r = await repo.saveTenant(slug, { content }, expected_version ?? t.version, AUTHOR, note ?? `Claude: ${Object.keys(changes).join("، ")}`);
    return saveResult(r, slug, origin);
  }));

  server.registerTool("edit_content", {
    title: "Precise edits",
    description: "Small edits by path, all saved together as one revision. Paths use dots and list indexes: \"hero.kicker\", \"schedule.slots.2.time\", \"exams.items.0.prize\". Ops: set (replace/create a value; \"list.-\" appends), append (add to the end of a list), insert (at a list index, shifting the rest), remove (a key or a list item).",
    inputSchema: {
      slug: slugArg,
      operations: z.array(z.object({
        op: z.enum(["set", "append", "insert", "remove"]),
        path: z.string(),
        value: z.unknown().optional(),
      })).min(1),
      expected_version: z.number().int().optional(),
      note: z.string().optional(),
    },
  }, safe(async ({ slug, operations, expected_version, note }) => {
    const t = await repo.getTenant(slug);
    if (!t) return fail(`No teacher "${slug}".`);
    if (operations.some((o) => o.path.split(".")[0] === "slug")) return fail("slug can't be changed.");
    let content: Content;
    try { content = applyOps(t.content, operations as Op[]); } catch (e) { return fail(`Not saved: ${(e as Error).message}`); }
    const r = await repo.saveTenant(slug, { content }, expected_version ?? t.version, AUTHOR, note ?? `Claude: ${[...new Set(operations.map((o) => o.path.split(".")[0]))].join("، ")}`);
    return saveResult(r, slug, origin);
  }));

  server.registerTool("update_theme", {
    title: "Change the look",
    description: "Colors, fonts, corner radius and style options. Merged over the current theme, so pass only what changes. See get_schema part \"theme\".",
    inputSchema: {
      slug: slugArg,
      theme: z.record(z.string(), z.unknown()).describe("e.g. { \"colors\": { \"accent\": \"#1e6bd6\", \"accentHot\": \"#3b82f6\" }, \"scheme\": \"light\" }"),
      expected_version: z.number().int().optional(),
    },
  }, safe(async ({ slug, theme, expected_version }) => {
    const t = await repo.getTenant(slug);
    if (!t) return fail(`No teacher "${slug}".`);
    const r = await repo.saveTenant(slug, { theme: deepMerge(t.theme, theme) }, expected_version ?? t.version, AUTHOR, "Claude: الهوية البصرية");
    return saveResult(r, slug, origin);
  }));

  server.registerTool("set_teacher_status", {
    title: "Publish or hide",
    description: "active = the page is online; disabled = every address of the teacher shows 'not found' (content is kept).",
    inputSchema: { slug: slugArg, status: z.enum(["active", "disabled"]) },
    annotations: { destructiveHint: true },
  }, safe(async ({ slug, status }) => {
    if (!(await repo.getTenant(slug))) return fail(`No teacher "${slug}".`);
    await repo.setTenantStatus(slug, status);
    refreshTeacher(slug);
    return ok({ slug, status });
  }));

  /* ----- images ----- */

  server.registerTool("create_upload_link", {
    title: "Photo upload link",
    description: "A private link where the user can drop the teacher's photos from phone or computer (no login). Send it to the user, wait until they say they're done, then list_images. Works for a teacher that doesn't exist yet too (upload first, create after).",
    inputSchema: { slug: slugArg, hours: z.number().min(1).max(72).optional().describe("How long the link works. Default 24.") },
  }, safe(async ({ slug, hours }) => {
    if (!SLUG_RE.test(slug)) return fail("Invalid slug.");
    return ok({ ...makeUploadLink(origin, slug, hours ?? 24), tip: "Ask the user to name files meaningfully if they can (teacher.jpg, book-cover.jpg, logo.png); names are kept in the image keys." });
  }));

  server.registerTool("upload_image", {
    title: "Upload an image",
    description: "Stores an image in the teacher's folder from a public link (https; Google Drive/Dropbox share links are converted) or base64 data. JPG, PNG, WEBP, GIF or AVIF, up to 4 MB. Returns the key to put in image fields.",
    inputSchema: {
      slug: slugArg,
      source_url: z.string().url().optional(),
      data_base64: z.string().optional().describe("Raw base64 or a data: URL."),
      file_name: z.string().optional().describe("Readable name kept in the key, e.g. \"book-cover\"."),
    },
  }, safe(async ({ slug, source_url, data_base64, file_name }) => {
    if (!SLUG_RE.test(slug)) return fail("Invalid slug.");
    if (!source_url === !data_base64) return fail("Give exactly one of source_url or data_base64.");
    let bytes: Uint8Array;
    try {
      bytes = source_url ? await fetchImage(source_url) : new Uint8Array(Buffer.from(data_base64!.replace(/^data:[^,]*,/, ""), "base64"));
    } catch (e) { return fail(`Could not get the image: ${(e as Error).message}`); }
    const name = file_name ?? (source_url ? decodeURIComponent(new URL(source_url).pathname.split("/").pop() ?? "") : undefined);
    try {
      const stored = await storeImage(slug, bytes, undefined, name);
      return ok({ ...stored, url: abs(stored.url) });
    } catch (e) {
      if (e instanceof ImageError) return fail(`Not an accepted image (JPG, PNG, WEBP, GIF, AVIF up to 4 MB). ${source_url ? "If this is a share page rather than the image itself, ask for a direct link or use create_upload_link." : ""}`);
      throw e;
    }
  }));

  server.registerTool("list_images", {
    title: "List uploaded images",
    description: "Images uploaded for the teacher (newest first) with their keys and URLs, and whether the page already uses each one.",
    inputSchema: { slug: slugArg },
    annotations: { readOnlyHint: true },
  }, safe(async ({ slug }) => {
    const [files, t] = await Promise.all([listObjects(slug, "uploads"), repo.getTenant(slug)]);
    const used = t ? usedImages(t.content) : new Set<string>();
    return ok(files.map((f) => ({ ...f, url: abs(assetUrl(slug, f.key)), used: used.has(f.key) })));
  }));

  server.registerTool("view_image", {
    title: "Look at an image",
    description: "Returns an uploaded image so you can see it (to decide which photo goes where, or write alt text).",
    inputSchema: { slug: slugArg, key: z.string().describe("Key from list_images, e.g. \"uploads/...jpg\".") },
    annotations: { readOnlyHint: true },
  }, safe(async ({ slug, key }) => {
    if (key.includes("..") || key.startsWith("/")) return fail("Invalid key.");
    const bytes = await getObject(slug, key);
    if (!bytes) return fail(`No image "${key}" for ${slug}.`);
    const type = sniffImage(bytes);
    if (!type) return fail("That file is not an image.");
    if (bytes.byteLength > 3 * 1024 * 1024) return ok({ key, url: abs(assetUrl(slug, key)), note: "Too large to show here (over 3 MB); open the URL." });
    return { content: [{ type: "image", data: Buffer.from(bytes).toString("base64"), mimeType: type }, { type: "text", text: abs(assetUrl(slug, key)) }] };
  }));

  /* ----- domains and logins ----- */

  server.registerTool("manage_domain", {
    title: "Domains",
    description: "add / remove / make_primary a custom domain for the teacher. The primary one is what Google indexes. After adding, the same domain must also be added in Vercel (Settings → Domains) and its DNS set at the registrar.",
    inputSchema: { slug: slugArg, action: z.enum(["add", "remove", "make_primary"]), domain: z.string().describe("e.g. \"mohamedali.com\" or \"www.mohamedali.com\".") },
    annotations: { destructiveHint: true },
  }, safe(async ({ slug, action, domain }) => {
    if (!(await repo.getTenant(slug))) return fail(`No teacher "${slug}".`);
    const d = normalizeDomain(domain);
    if (action === "add") {
      if (!repo.DOMAIN_RE.test(d)) return fail("Not a valid domain, e.g. mohamedali.com");
      if (isPlatformHost(d, env.rootDomain, env.platformHosts)) return fail("That domain is reserved for the platform.");
      try { await repo.addDomain(slug, d); } catch { return fail("That domain is already used."); }
    } else if (action === "remove") await repo.removeDomain(slug, d);
    else await repo.makePrimaryDomain(slug, d);
    refreshTeacher(slug, true);
    return ok({ slug, domains: (await repo.getTenant(slug))?.domains, ...(action === "add" ? { next: `Add ${d} in Vercel → Settings → Domains and set the DNS records it shows.` } : {}) });
  }));

  server.registerTool("manage_login", {
    title: "Teacher logins",
    description: "list / create / reset_password / disable / enable / delete a login for the teacher's own admin panel. create and reset_password return a new password ONCE: give it to the user with the login link.",
    inputSchema: {
      slug: slugArg,
      action: z.enum(["list", "create", "reset_password", "disable", "enable", "delete"]),
      username: z.string().optional().describe("Needed for everything except list. 3-32 lowercase letters, digits, . _ -"),
    },
    annotations: { destructiveHint: true },
  }, safe(async ({ slug, action, username }) => {
    if (!(await repo.getTenant(slug))) return fail(`No teacher "${slug}".`);
    if (action === "list") return ok(await repo.listUsers(slug));
    const name = (username ?? "").trim().toLowerCase();
    if (!USERNAME_RE.test(name)) return fail("username: 3-32 lowercase English letters, digits, . _ -");
    if (action === "create") {
      const password = generatePassword();
      try { await repo.createUser(slug, name, await hashPassword(password)); } catch { return fail("That username is taken."); }
      return ok({ username: name, password, login_url: await absoluteLogin(slug), note: "Shown once." });
    }
    const user = (await repo.listUsers(slug)).find((u) => u.username === name);
    if (!user) return fail(`No login "${name}" for ${slug}.`);
    if (action === "reset_password") {
      const password = generatePassword();
      await repo.updateUser(slug, user.id, { passwordHash: await hashPassword(password) });
      return ok({ username: name, password, login_url: await absoluteLogin(slug), note: "Shown once." });
    }
    if (action === "delete") await repo.deleteUser(slug, user.id);
    else await repo.updateUser(slug, user.id, { disabled: action === "disable" });
    return ok({ username: name, done: action });
  }));
  const absoluteLogin = async (slug: string) => {
    const u = await loginUrlFor(slug);
    return u.startsWith("/") ? `${origin}${u}` : u;
  };

  /* ----- form requests ----- */

  server.registerTool("list_requests", {
    title: "Form requests",
    description: "What students sent through form buttons (newest first): their answers (name, phone...), what the button carried (challenge answer, group, exam), the button, and status new/contacted/done.",
    inputSchema: {
      slug: slugArg,
      form: z.string().optional().describe("Only this form id."),
      status: z.enum(STATUSES).optional(),
      search: z.string().optional().describe("Text in the answers, e.g. part of a phone number or a name."),
      limit: z.number().int().min(1).max(500).optional(),
    },
    annotations: { readOnlyHint: true },
  }, safe(async ({ slug, form, status, search, limit }) => ok(await listSubmissions(slug, { form, status, q: search, limit: limit ?? 50 }))));

  server.registerTool("update_requests", {
    title: "Mark requests",
    description: "Set the status of requests (by id from list_requests): new, contacted, done.",
    inputSchema: { slug: slugArg, ids: z.array(z.number().int()).min(1), status: z.enum(STATUSES) },
  }, safe(async ({ slug, ids, status }) => { await setStatus(slug, ids, status); return ok({ updated: ids.length, status }); }));

  /* ----- history and analytics ----- */

  server.registerTool("list_revisions", {
    title: "History",
    description: "Saved versions of the teacher's page (newest first): who saved, when, and what.",
    inputSchema: { slug: slugArg, limit: z.number().int().min(1).max(100).optional() },
    annotations: { readOnlyHint: true },
  }, safe(async ({ slug, limit }) => ok(await repo.listRevisions(slug, limit ?? 20))));

  server.registerTool("restore_revision", {
    title: "Undo to a version",
    description: "Brings the page (content and theme) back to an earlier saved version. Creates a new version; nothing is deleted.",
    inputSchema: { slug: slugArg, revision_id: z.number().int().describe("id from list_revisions") },
    annotations: { destructiveHint: true },
  }, safe(async ({ slug, revision_id }) => saveResult(await repo.restoreRevision(slug, revision_id, AUTHOR), slug, origin)));

  server.registerTool("get_analytics", {
    title: "Visits and conversions",
    description: "The teacher's analytics: visitors, page views, visitors who contacted them (WhatsApp/Telegram/Messenger/call) or went to their channels, clicks by destination and place, sections reached, time on page, devices, sources, and the last 30 days.",
    inputSchema: { slug: slugArg, range: z.enum(RANGES).optional().describe("today | month (default) | lastMonth | all") },
    annotations: { readOnlyHint: true },
  }, safe(async ({ slug, range }) => {
    const r = await report(slug, range ?? "month");
    return r ? ok(r) : fail("No analytics: unknown teacher or no database.");
  }));

  return server;
}
