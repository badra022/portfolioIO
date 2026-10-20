import { connection } from "next/server";
import { registerClient } from "@/lib/server/oauth";
import { oauthJson, platformOnly, preflight } from "@/lib/server/oauth-http";

/** RFC 7591 dynamic client registration: Claude registers itself when the connector is added. */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/oauth/register">) {
  await connection();
  if (!(await platformOnly(ctx.params))) return new Response("Not found", { status: 404 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return oauthJson({ error: "invalid_client_metadata", error_description: "JSON body required" }, 400);
  const r = registerClient(body as Record<string, unknown>);
  return r.ok ? oauthJson(r.client, 201) : oauthJson({ error: "invalid_redirect_uri", error_description: r.error }, 400);
}
export const OPTIONS = preflight;
