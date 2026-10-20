import { connection } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/server/passwords";
import { buildMcpServer } from "@/lib/server/mcp/server";
import { accessIdentity, requestOrigin, scopeOf, type McpScope } from "@/lib/server/oauth";
import { preflight } from "@/lib/server/oauth-http";

/**
 * The MCP server at https://<platform host>/api/mcp. Two ways in:
 * - OAuth (lib/server/oauth.ts): a partner (or teacher, or the super admin) adds it as a
 *   custom connector in Claude and signs in with their myostaz login. A partner reaches
 *   only its own teachers.
 * - The super admin's MCP_TOKEN: /api/mcp/<MCP_TOKEN> or "Authorization: Bearer <MCP_TOKEN>".
 * Platform host only. Stateless: every request gets a fresh server, which suits serverless functions.
 */
export const maxDuration = 60;

const notFound = () => new Response("Not found", { status: 404 });

async function handle(req: Request, ctx: RouteContext<"/sites/[site]/api/mcp/[[...key]]">) {
  await connection();
  const { site, key } = await ctx.params;
  if (decodeURIComponent(site) !== "_platform") return notFound();
  const origin = requestOrigin(req);
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  const pathToken = key?.length === 1 ? decodeURIComponent(key[0]) : "";
  const isMaster = (t: string) => env.mcpToken.length >= 32 && Boolean(t) && safeEqual(t, env.mcpToken);

  let scope: McpScope | null = null;
  if (isMaster(pathToken) || isMaster(bearer)) scope = { kind: "super" };
  else if (pathToken) return notFound();
  else if (bearer) {
    const who = await accessIdentity(bearer);
    scope = who ? await scopeOf(who) : null;
  }
  if (!scope) {
    // Tells Claude where to sign in (RFC 9728); it then runs the OAuth flow.
    return new Response(JSON.stringify({ error: "invalid_token", error_description: "Sign in to myostaz.com" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*",
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"${bearer ? ', error="invalid_token"' : ""}`,
      },
    });
  }

  // Stateless: no standalone event stream (it would only hold a function open) and no sessions to end.
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });

  const server = await buildMcpServer(origin, scope);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
export const OPTIONS = preflight;
