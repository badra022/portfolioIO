import { connection } from "next/server";
import { checkAuthorize, issueCode, requestOrigin } from "@/lib/server/oauth";
import { readSession } from "@/lib/server/session";

/**
 * «اسمح» on the consent page (app/sites/[site]/oauth/authorize): hands Claude a code for
 * the signed-in account. The session cookie is SameSite=Lax, so another site can't post here
 * on someone's behalf.
 */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/oauth/approve">) {
  await connection();
  if (decodeURIComponent((await ctx.params).site) !== "_platform") return new Response("Not found", { status: 404 });
  const form = new URLSearchParams(await req.text());
  const checked = await checkAuthorize(form);
  if (!checked.ok) return new Response(checked.error, { status: 400 });
  const who = readSession(req.headers.get("cookie"));
  if (!who) return new Response(null, { status: 303, headers: { Location: `${requestOrigin(req)}/oauth/authorize?${form}` } });
  const to = new URL(checked.req.redirectUri);
  if (form.get("decision") === "allow") to.searchParams.set("code", issueCode(who, checked.req));
  else to.searchParams.set("error", "access_denied");
  if (checked.req.state) to.searchParams.set("state", checked.req.state);
  return new Response(null, { status: 303, headers: { Location: to.toString(), "Cache-Control": "no-store" } });
}
