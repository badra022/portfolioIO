import { connection } from "next/server";
import { cookies } from "next/headers";
import { hasDb } from "@/lib/env";
import { getSiteData } from "@/lib/server/site";
import { activeTenantId } from "@/lib/server/analytics";
import { castVote, pollResults } from "@/lib/server/polls";
import { pollStatus } from "@/lib/poll";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * The vote page's server side (components/PollApp.tsx):
 * - status { poll }          -> the server's clock, whether it's open, and (after voting) the results
 * - vote   { poll, choice }  -> counts one vote
 * Anonymous: only the count per choice is stored. A cookie on the device (no id,
 * just "voted") keeps the same browser from voting twice.
 */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/poll">) {
  await connection();
  const site = decodeURIComponent((await ctx.params).site);
  const text = await req.text();
  if (text.length > 2048) return json({ ok: false, error: "too large" }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(text); } catch { return json({ ok: false, error: "bad request" }, 400); }

  const data = await getSiteData(site);
  if (data.kind !== "tenant") return json({ ok: false, error: "not found" }, 404);
  const poll = data.content.polls.find((p) => p.path === body.poll);
  if (!poll) return json({ ok: false, error: "not found" }, 404);
  if (!hasDb()) return json({ ok: false, error: "unavailable" }, 503);
  const tenantId = await activeTenantId(data.slug);
  if (!tenantId) return json({ ok: false, error: "not found" }, 404);

  const jar = await cookies();
  const mark = `pv-${data.env === "preview" ? "p-" : ""}${data.slug}-${poll.path}`;
  const voted = jar.get(mark)?.value === "1";
  const results = async () => (poll.showResults ? pollResults(tenantId, data.env, poll) : null);

  try {
    if (body.op === "status") {
      return json({ ok: true, now: Date.now(), status: pollStatus(poll), voted, results: voted ? await results() : null });
    }
    if (body.op === "vote") {
      if (voted) return json({ ok: false, error: "voted", results: await results() }, 409);
      const r = await castVote(tenantId, data.env, poll, body.choice);
      if (!r.ok) return json({ ok: false, error: r.error }, r.error === "choice" ? 422 : 409);
      jar.set(mark, "1", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
      return json({ ok: true, results: poll.showResults ? r.results : null });
    }
    return json({ ok: false, error: "bad request" }, 400);
  } catch (e) {
    console.error("poll", e);
    return json({ ok: false, error: "server" }, 500);
  }
}
