import { connection } from "next/server";
import { protectedResourceMetadata, requestOrigin } from "@/lib/server/oauth";
import { oauthJson, platformOnly, preflight } from "@/lib/server/oauth-http";

/** RFC 9728: the MCP server (/api/mcp) signs in through this platform's OAuth (lib/server/oauth.ts). */
export async function GET(req: Request, ctx: RouteContext<"/sites/[site]/.well-known/oauth-protected-resource/[[...rest]]">) {
  await connection();
  if (!(await platformOnly(ctx.params))) return new Response("Not found", { status: 404 });
  return oauthJson(protectedResourceMetadata(requestOrigin(req)));
}
export const OPTIONS = preflight;
