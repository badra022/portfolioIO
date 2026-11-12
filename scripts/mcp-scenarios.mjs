// End-to-end scenarios for the MCP server (src/lib/server/mcp), against a running app:
// what an AI agent does through it, step by step, on a throwaway teacher.
//
//   MCP_TOKEN=… DATABASE_URL=… ADMIN_USER=… node scripts/mcp-scenarios.mjs [http://localhost:3000]
//
// The app must run WITHOUT ROOT_DOMAIN (teacher sites at /t/<slug>), with the same
// MCP_TOKEN, DATABASE_URL and ADMIN_USER. CI starts it and runs this after the build.
import { deflateSync } from "node:zlib";
import postgres from "postgres";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.MCP_TOKEN;
const ADMIN = process.env.ADMIN_USER ?? "admin";
if (!TOKEN || !process.env.DATABASE_URL) { console.error("Set MCP_TOKEN and DATABASE_URL."); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, onnotice: () => {} });

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) fails++; };
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

async function connect(headers) {
  const c = new Client({ name: "scenarios", version: "1" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers } }));
  return c;
}
/** Calls a tool: { data (parsed JSON), error (the error object when it failed), bytes }. */
const caller = (c) => async (name, args = {}) => {
  const r = await c.callTool({ name, arguments: args });
  const text = r.content.map((x) => x.text ?? "").join("");
  let data = null;
  try { data = JSON.parse(text); } catch { /* an image or plain text */ }
  return { data, error: r.isError ? data?.error ?? { code: "?", message: text } : null, bytes: Buffer.byteLength(text), raw: r };
};

/** A valid PNG (solid color), built here so the test needs no image file. */
function png(size, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(Buffer.concat(Array(size).fill(row)))), chunk("IEND", Buffer.alloc(0))]);
}

const slug = `scn-${Date.now().toString(36)}`;
const superMcp = await connect({ Authorization: `Bearer ${TOKEN}` });
const call = caller(superMcp);
const superName = `${ADMIN} (مدير)`;

try {
  /* ---------- what every conversation loads ---------- */
  const tools = (await superMcp.listTools()).tools;
  const defs = Buffer.byteLength(JSON.stringify(tools));
  const instructions = Buffer.byteLength(superMcp.getInstructions() ?? "");
  console.log(`      ${tools.length} tools, definitions ${kb(defs)}, instructions ${kb(instructions)}`);
  check(instructions < 2600, `instructions are short (${kb(instructions)})`);
  check(defs < 25_600, `tool definitions stay under 25 KB (${kb(defs)})`);
  check(tools.every((t) => t.annotations?.readOnlyHint === true || typeof t.annotations?.destructiveHint === "boolean"), "every tool says whether it reads, writes or destroys");
  const prompts = (await superMcp.listPrompts()).prompts.map((p) => p.name);
  check(["onboard_teacher", "weekly_exam", "monthly_promo", "answer_requests"].every((p) => prompts.includes(p)), `ready-made workflows: ${prompts.join(", ")}`);
  const promptText = (await superMcp.getPrompt({ name: "weekly_exam", arguments: { topic: "الباب الأول" } })).messages[0].content.text;
  check(promptText.includes("الباب الأول") && promptText.includes("grade_quiz"), "a workflow carries its steps");
  const resources = (await superMcp.listResources()).resources.map((r) => r.uri);
  check(resources.includes("myostaz://guide/quizzes") && resources.includes("myostaz://schema/hero"), `guides and schemas as resources (${resources.length})`);
  const guide = await call("get_guide", { topic: "images" });
  check(guide.data?.guide?.includes("curl -F"), "get_guide explains uploading images directly");

  /* ---------- a new teacher ---------- */
  const made = await call("create_teacher", { slug, name: "مستر تجربة", copy_from: "mohamed-ali" });
  check(!made.error && made.data.plan?.off?.length === 0, "create_teacher: created, with every plan bundle on");

  /* ---------- reading small ---------- */
  const summary = await call("get_teacher", { slug });
  const full = await call("get_teacher", { slug, view: "full" });
  console.log(`      summary ${kb(summary.bytes)} vs full ${kb(full.bytes)}`);
  check(!summary.error && summary.data.content_summary && summary.bytes < full.bytes / 3, "get_teacher: the default is a summary, at most a third of the full page");
  const slots = summary.data.content_summary.schedule.slots;
  check(slots.count > 0 && typeof slots.id?.[0] === "string", `summary lists list items by id (${slots.id?.join(", ")})`);
  const firstId = slots.id[0];
  const one = await call("get_teacher", { slug, path: `schedule.slots[id=${firstId}]` });
  check(one.data?.value?.id === firstId && one.bytes < 700, `get_teacher path: one slot by id (${one.bytes} bytes)`);
  const part = await call("get_schema", { part: "quizzes", path: "questions" });
  const whole = await call("get_schema", { part: "quizzes" });
  check(!part.error && part.bytes < whole.bytes, `get_schema path: one field's schema (${kb(part.bytes)} of ${kb(whole.bytes)})`);

  /* ---------- editing by id, dry run, preview vs live ---------- */
  const v0 = summary.data.preview_version;
  const dry = await call("edit_content", { slug, dry_run: true, operations: [{ op: "set", path: `schedule.slots[id=${firstId}].time`, value: "18:45" }] });
  check(dry.data?.dry_run && dry.data.would_change?.[0]?.path === `schedule.slots[id=${firstId}].time` && dry.data.would_change[0].after === "18:45", "dry_run: shows what would change (before → after)");
  check((await call("get_teacher", { slug, path: "sections" })).data.preview_version === v0, "dry_run: nothing saved");
  const saved = await call("edit_content", { slug, operations: [{ op: "set", path: `schedule.slots[id=${firstId}].time`, value: "18:45" }] });
  check(saved.data?.saved === "preview" && saved.data.live === false && saved.data.publish_with === "publish_preview" && saved.data.changed?.[0]?.endsWith(".time"), "save: says it's in the preview, not live, and how to publish");
  check(saved.bytes < 600, `save reply is small (${saved.bytes} bytes)`);
  const inPreview = await call("get_teacher", { slug, env: "preview", path: `schedule.slots[id=${firstId}].time` });
  const inLive = await call("get_teacher", { slug, path: `schedule.slots[id=${firstId}].time` });
  check(inPreview.data.value === "18:45" && inLive.data.value !== "18:45", "the edit is in the preview only");
  const same = await call("edit_content", { slug, operations: [{ op: "set", path: `schedule.slots[id=${firstId}].time`, value: "18:45" }] });
  check(same.data?.unchanged === true, "saving the same value again: unchanged, no new version");
  const merged = await call("edit_content", { slug, operations: [{ op: "merge", path: `schedule.slots[id=${firstId}]`, value: { mode: "أونلاين" } }] });
  const afterMerge = await call("get_teacher", { slug, env: "preview", path: `schedule.slots[id=${firstId}]` });
  check(!merged.error && afterMerge.data.value.mode === "أونلاين" && afterMerge.data.value.time === "18:45", "merge: changes one field and keeps the rest");

  /* ---------- errors an agent can act on ---------- */
  const badId = await call("edit_content", { slug, operations: [{ op: "set", path: "schedule.slots[id=NOPE].time", value: "10:00" }] });
  check(badId.error?.code === "BAD_PATH" && badId.error.message.includes(firstId), "wrong item id → BAD_PATH, listing the ids that exist");
  const stale = await call("edit_content", { slug, expected_version: 1, operations: [{ op: "set", path: "hero.kicker", value: "x" }] });
  check(stale.error?.code === "VERSION_CONFLICT" && typeof stale.error.version === "number" && stale.error.fix, "old expected_version → VERSION_CONFLICT with the current version and a fix");
  const invalid = await call("edit_content", { slug, operations: [{ op: "upsert", path: "quizzes", value: { path: "Bad Path!", title: 5 } }] });
  const issue = invalid.error?.issues?.find((i) => i.path.endsWith(".title"));
  check(invalid.error?.code === "VALIDATION" && issue && /string/i.test(issue.message) && issue.message_ar && invalid.error.fix.includes("get_schema"), `invalid content → VALIDATION with the field, English and Arabic messages (${issue?.path}: ${issue?.message})`);
  const noSlug = await call("get_teacher", {});
  check(noSlug.error?.code === "SLUG_REQUIRED", "super admin without slug → SLUG_REQUIRED");
  const noOne = await call("get_teacher", { slug: "no-such-teacher" });
  check(noOne.error?.code === "NOT_FOUND" && noOne.error.fix, "unknown teacher → NOT_FOUND with a fix");

  /* ---------- one quiz: upsert, plan, publish ---------- */
  const quiz = (title) => ({
    path: "chem-1", title, state: "open", durationMinutes: 0,
    questions: [
      { text: "رمز الصوديوم؟", type: "choice", options: ["Na", "S", "So"], correct: ["Na"], points: 2 },
      { text: "اشرح قانون بويل.", type: "text", points: 3 },
    ],
  });
  const q1 = await call("edit_content", { slug, operations: [{ op: "upsert", path: "quizzes", value: quiz("اختبار الباب الأول") }] });
  check(!q1.error && q1.data.changed.includes("quizzes[path=chem-1]"), "upsert: adds the quiz (preview accepts it without the bundle)");
  const q2 = await call("edit_content", { slug, operations: [{ op: "upsert", path: "quizzes", value: quiz("اختبار الباب الأول (معدّل)") }] });
  const quizzes = await call("get_teacher", { slug, env: "preview", path: "quizzes" });
  check(!q2.error && quizzes.data.value.length === 1 && quizzes.data.value[0].title.includes("معدّل") && q2.data.changed.join() === "quizzes[path=chem-1].title", "upsert again: replaces the same quiz, and reports only the title changed");
  // Every bundle is on by default: switch «exams» off by hand to see what a refusal looks like.
  const off = await call("manage_plan", { slug, disable: ["exams"] });
  check(off.data?.off?.join() === "exams" && off.data.on.includes("library"), "manage_plan: only the bundle switched off is off");
  const blocked = await call("publish_preview", { slug, action: "publish" });
  check(blocked.error?.code === "PLAN_FEATURE_OFF" && blocked.error.features.includes("exams") && blocked.error.fix.includes("manage_plan") && blocked.error.message_ar, "publishing a quiz without the bundle → PLAN_FEATURE_OFF, naming the bundle and the fix");
  const plan = await call("manage_plan", { slug, enable: ["exams"] });
  check(plan.data?.on?.includes("exams"), "manage_plan turns the bundle back on");
  const published = await call("publish_preview", { slug, action: "publish" });
  check(published.data?.live === true && published.data.saved === "production", "publish: now live");

  /* ---------- grading many at once ---------- */
  const site = made.data.site_url.replace(/^https?:\/\/[^/]+/, BASE);
  const tokens = [];
  for (const [i, answer] of [["Na", "الضغط يتناسب عكسياً مع الحجم"], ["S", "مش عارف"], ["Na", "الحجم يقل لما الضغط يزيد"]].entries()) {
    const start = await (await fetch(`${site}/api/quiz`, { method: "POST", body: JSON.stringify({ op: "start", quiz: "chem-1", values: {} }) })).json();
    if (!start.ok) { check(false, `student ${i + 1} starts the quiz: ${JSON.stringify(start)}`); continue; }
    const done = await (await fetch(`${site}/api/quiz`, { method: "POST", body: JSON.stringify({ op: i === 1 ? "save" : "submit", token: start.attempt.token, answers: { 0: answer[0], 1: answer[1] } }) })).json();
    if (done.ok) tokens.push(start.attempt.token);
  }
  check(tokens.length === 3, "3 students answered on the site (2 handed in, 1 still answering)");
  const sum = await call("quiz_results", { slug, path: "chem-1" });
  check(sum.data?.metrics?.started === 3 && sum.data.metrics.submitted === 2 && sum.data.grading.waiting === 2 && !("attempts" in sum.data), `quiz_results: a summary by default (${kb(sum.bytes)}), no attempts`);
  const filtered = await call("quiz_results", { slug, path: "chem-1", view: "attempts", status: "submitted", limit: 1 });
  check(filtered.data?.total === 2 && filtered.data.rows.length === 1 && filtered.data.next_offset === 1 && !("answers" in filtered.data.rows[0]), "attempts: status filter and paging, without answers unless asked");
  const todo = await call("quiz_results", { slug, path: "chem-1", view: "needs_grading" });
  check(todo.data?.rows?.length === 2 && todo.data.written_questions.length === 1 && todo.data.written_questions[0].index === 1 && Object.keys(todo.data.rows[0].written).join() === "1", "needs_grading: only finished attempts, only the written answers");
  const grades = todo.data.rows.map((r, i) => ({ attempt: r.attempt, score: i ? 4 : 5, note: "أحسنت", name: `طالب ${i + 1}`, phone: `0101234567${i}` }));
  const graded = await call("grade_quiz", { slug, path: "chem-1", action: "grade", grades: [...grades, { attempt: 999999999, score: 1 }] });
  check(graded.data?.graded === 2 && graded.data.failed?.length === 1 && graded.data.failed[0].attempt === 999999999, "grade_quiz: 2 grades in one call, the unknown attempt reported");
  const after = await call("quiz_results", { slug, path: "chem-1" });
  check(after.data.grading.approved === 2 && after.data.grading.waiting === 0, "the grades are approved");
  const reviewers = await sql`select distinct reviewed_by from quiz_attempts a join tenants t on t.id = a.tenant_id where t.slug = ${slug} and reviewed_by is not null`;
  check(reviewers.length === 1 && reviewers[0].reviewed_by === superName, `grades are recorded under the signed-in account (${reviewers[0]?.reviewed_by})`);

  /* ---------- images, uploaded by the agent itself ---------- */
  const link = await call("create_upload_link", { slug });
  const form = new FormData();
  form.append("file", new Blob([png(64, [30, 107, 214])], { type: "image/png" }), "q1-diagram.png");
  const up = await fetch(link.data.upload_url.replace(/^https?:\/\/[^/]+/, BASE), { method: "POST", body: form });
  const upData = await up.json();
  const key = upData.results?.[0]?.key;
  check(up.ok && key?.startsWith("uploads/") && key.includes("q1-diagram"), `direct upload with the signed address → key ${key}`);
  const images = await call("list_images", { slug });
  check(images.data?.images?.some((f) => f.key === key), "list_images shows it");
  const seen = await call("view_image", { slug, key });
  check(seen.raw.content[0]?.type === "image", "view_image returns the picture");
  const used = await call("edit_content", { slug, operations: [{ op: "set", path: "quizzes[path=chem-1].questions.0.image", value: key }] });
  check(!used.error, "the uploaded image goes on a quiz question");
  const badLink = await fetch(`${BASE}/api/upload?t=${slug}&e=9999999999&s=nope`, { method: "POST", body: form });
  check(badLink.status === 403, "a forged upload address is refused");

  /* ---------- a teacher's own login ---------- */
  const login = await call("manage_login", { slug, action: "create", username: `t${slug.replace(/-/g, "")}`.slice(0, 20) });
  const cb = "http://localhost:8765/cb";
  const reg = await (await fetch(`${BASE}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: [cb], client_name: "Scenarios" }) })).json();
  const { createHash, randomBytes } = await import("node:crypto");
  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: cb, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: "s", scope: "mcp" });
  const signIn = new FormData();
  signIn.set("username", login.data.username); signIn.set("password", login.data.password); signIn.set("as", "connect"); signIn.set("next", `/oauth/authorize?${authorize}`);
  const signed = await fetch(`${BASE}/api/auth/login`, { method: "POST", body: signIn, redirect: "manual" });
  const cookie = (signed.headers.get("set-cookie") ?? "").split(";")[0];
  const approve = await fetch(`${BASE}/oauth/approve`, { method: "POST", redirect: "manual", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...Object.fromEntries(authorize), decision: "allow" }) });
  const code = new URL(approve.headers.get("location") ?? "http://x/").searchParams.get("code");
  const tok = await (await fetch(`${BASE}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: code ?? "", client_id: reg.client_id, redirect_uri: cb, code_verifier: verifier }) })).json();
  check(Boolean(tok.access_token), "the teacher's login connects (OAuth)");
  const teacherMcp = await connect({ Authorization: `Bearer ${tok.access_token}` });
  const tcall = caller(teacherMcp);
  const tTools = (await teacherMcp.listTools()).tools.map((t) => t.name);
  check(!["create_teacher", "manage_plan", "manage_login", "update_theme", "manage_domain", "set_teacher_status", "manage_site_files"].some((t) => tTools.includes(t)) && tTools.includes("edit_content") && tTools.includes("grade_quiz"), "teacher: admin-only tools hidden, editing and grading offered");
  check(!(await teacherMcp.listPrompts()).prompts.some((p) => p.name === "onboard_teacher"), "teacher: no onboarding workflow");
  const mineOnly = await tcall("get_teacher");
  check(mineOnly.data?.slug === slug, "teacher: slug can be left out");
  const notMine = await tcall("get_teacher", { slug: "mohamed-ali" });
  check(notMine.error?.code === "NOT_YOUR_SITE", "teacher: another site → NOT_YOUR_SITE");
  const tEdit = await tcall("edit_content", { operations: [{ op: "set", path: "hero.kicker", value: "من حساب المدرس" }], note: "تعديل العنوان" });
  check(tEdit.data?.saved === "preview", "teacher: edits their own site without a slug");
  await teacherMcp.close();

  /* ---------- who did it ---------- */
  const history = (await call("list_revisions", { slug, limit: 50 })).data;
  const authors = [...new Set(history.revisions.map((r) => r.author))];
  check(history.kept_days === 7 && authors.includes(superName) && authors.includes(login.data.username) && !authors.some((a) => /claude|mcp/i.test(a)), `history names the accounts, not the tool: ${authors.join(" | ")}`);
  check(history.revisions[0].author === login.data.username && history.revisions[0].note === "تعديل العنوان", "the teacher's own edit is under the teacher's username");

  /* ---------- versions live for a week ---------- */
  const before = await sql`select r.id, r.env from tenant_revisions r join tenants t on t.id = r.tenant_id where t.slug = ${slug} order by r.id`;
  // Pretend everything so far was saved 8 to 30 days ago.
  await sql`update tenant_revisions r set created_at = now() - make_interval(days => 8) - (select max(id) - r.id from tenant_revisions) * interval '1 minute' from tenants t where t.id = r.tenant_id and t.slug = ${slug}`;
  const hidden = (await call("list_revisions", { slug, limit: 50 })).data.revisions;
  check(hidden.length === 2 && hidden.every((r) => r.starting_point), `after 8 days only each copy's starting point is listed (${hidden.map((r) => `${r.env} v${r.version}`).join(", ")})`);
  const oldId = before.find((r) => !hidden.some((h) => h.id === Number(r.id))).id;
  const gone = await call("restore_revision", { slug, revision_id: Number(oldId) });
  check(gone.error?.code === "REVISION_GONE", "an older version can't be restored, even before it is deleted");
  const stillThere = await sql`select count(*)::int n from tenant_revisions r join tenants t on t.id = r.tenant_id where t.slug = ${slug}`;
  const fresh = await call("edit_content", { slug, operations: [{ op: "set", path: "hero.kicker", value: "تعديل جديد" }] });
  const left = await sql`select r.env, r.created_at < now() - interval '7 days' as old from tenant_revisions r join tenants t on t.id = r.tenant_id where t.slug = ${slug}`;
  check(!fresh.error && stillThere[0].n === before.length && left.length === 3 && left.filter((r) => r.old).length === 2, `the next save deletes the expired versions (${stillThere[0].n} rows → ${left.length}: the new one and a starting point per copy)`);
  const back = await call("restore_revision", { slug, revision_id: hidden.find((r) => r.env === "preview").id });
  check(back.data?.saved === "preview" && back.data.live === false, "a starting point can still be restored");
  const sweep = await (await fetch(`${BASE}/api/cron/sweep`)).json();
  check(sweep.ok === true && typeof sweep.deleted?.revisions === "number", `daily clean-up runs (${JSON.stringify(sweep.deleted)})`);

  /* ---------- the usage log ---------- */
  await new Promise((r) => setTimeout(r, 1500));
  const usage = await sql`select tool, error, actor, scope, bytes from mcp_calls where slug = ${slug}`;
  const codes = new Set(usage.map((u) => u.error).filter(Boolean));
  check(usage.length > 30 && ["BAD_PATH", "VALIDATION", "PLAN_FEATURE_OFF", "VERSION_CONFLICT"].every((c) => codes.has(c)), `usage log: ${usage.length} calls recorded with their error codes (${[...codes].join(", ")})`);
  check(usage.some((u) => u.scope === "teacher" && u.actor === login.data.username) && usage.some((u) => u.scope === "super"), "usage log: names who called");

  /* ---------- fixing a live quiz while the preview holds a draft ---------- */
  // The preview gets an unfinished quiz in front of the live one, so the same position means two different quizzes.
  const draft = await call("edit_content", { slug, operations: [{ op: "insert", path: "quizzes.0", value: { path: "draft-quiz", title: "مسودة", state: "closed", questions: [] } }] });
  check(!draft.error, "the preview gets an unfinished quiz in front of the live one");
  const held = await call("get_teacher", { slug });
  check(held.data?.unpublished_in_preview?.some((x) => x.includes("draft-quiz")) && held.data.note.includes("production"), "get_teacher shows what the preview holds and how to fix the live site without publishing it");
  const fix = await call("edit_content", { slug, target: "production", operations: [{ op: "set", path: "quizzes.0.title", value: "اختبار الباب الأول (تصحيح)" }, { op: "set", path: "quizzes.0.questions.1.text", value: "اشرح قانون بويل بالتفصيل." }] });
  check(!fix.error && fix.data.saved === "production" && fix.data.changed.includes("quizzes[path=chem-1].title") && fix.data.changed.includes("quizzes[path=chem-1].questions[text=اشرح قانون بويل بالتفصيل.]") === false, `a live edit by position is reported by the quiz's path (${fix.data?.changed?.join(", ")})`);
  check(fix.data?.warnings?.[0]?.includes("chem-1"), "…with a warning that students already started it");
  const liveQuizzes = (await call("get_teacher", { slug, path: "quizzes" })).data.value;
  const previewQuizzes = (await call("get_teacher", { slug, env: "preview", path: "quizzes" })).data.value;
  const title = (list, path) => list.find((q) => q.path === path)?.title;
  check(title(liveQuizzes, "chem-1")?.includes("تصحيح") && title(previewQuizzes, "chem-1")?.includes("تصحيح"), "the fix is in the live quiz and in the same quiz in the preview");
  check(title(previewQuizzes, "draft-quiz") === "مسودة" && !liveQuizzes.some((q) => q.path === "draft-quiz"), "the preview's draft quiz was not touched and is not live");
  const byPath = await call("edit_content", { slug, target: "production", operations: [{ op: "merge", path: "quizzes[path=chem-1]", value: { passPercent: 70 } }] });
  check(!byPath.error && (await call("get_teacher", { slug, env: "preview", path: "quizzes[path=chem-1].passPercent" })).data.value === 70, "editing the live quiz by its path reaches the preview too");
} finally {
  await call("set_teacher_status", { slug, status: "disabled" }).catch(() => {});
  await sql`delete from tenants where slug = ${slug}`.catch(() => {});
  await sql`delete from mcp_calls where slug = ${slug}`.catch(() => {});
  await superMcp.close().catch(() => {});
  await sql.end();
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
