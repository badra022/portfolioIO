import { connection } from "next/server";
import { exchange } from "@/lib/server/oauth";
import { oauthJson, platformOnly, preflight } from "@/lib/server/oauth-http";

/** Code (with its PKCE verifier) → access + refresh tokens; refresh token → a new pair. */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/oauth/token">) {
  await connection();
  if (!(await platformOnly(ctx.params))) return new Response("Not found", { status: 404 });
  const type = req.headers.get("content-type") ?? "";
  const form = type.includes("application/json")
    ? new URLSearchParams(Object.entries((await req.json().catch(() => ({}))) as Record<string, string>).map(([k, v]) => [k, String(v)]))
    : new URLSearchParams(await req.text());
  const r = await exchange(form);
  return r.ok ? oauthJson(r.tokens) : oauthJson({ error: r.error, error_description: r.description }, 400);
}
export const OPTIONS = preflight;
