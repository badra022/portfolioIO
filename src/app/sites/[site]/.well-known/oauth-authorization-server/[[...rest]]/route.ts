import { connection } from "next/server";
import { authorizationServerMetadata, requestOrigin } from "@/lib/server/oauth";
import { oauthJson, platformOnly, preflight } from "@/lib/server/oauth-http";

/** RFC 8414: where to register, sign in and get tokens (lib/server/oauth.ts). */
export async function GET(req: Request, ctx: RouteContext<"/sites/[site]/.well-known/oauth-authorization-server/[[...rest]]">) {
  await connection();
  if (!(await platformOnly(ctx.params))) return new Response("Not found", { status: 404 });
  return oauthJson(authorizationServerMetadata(requestOrigin(req)));
}
export const OPTIONS = preflight;
