import { connection } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/server/passwords";
import { buildMcpServer } from "@/lib/server/mcp/server";

/**
 * The MCP server: https://<platform host>/api/mcp/<MCP_TOKEN> (for claude.ai custom
 * connectors, which can't send headers), or /api/mcp with "Authorization: Bearer
 * <MCP_TOKEN>". Platform host only; off when MCP_TOKEN is unset. Stateless: every
 * request gets a fresh server, which suits serverless functions.
 */
export const maxDuration = 60;

const notFound = () => new Response("Not found", { status: 404 });

async function handle(req: Request, ctx: RouteContext<"/sites/[site]/api/mcp/[[...key]]">) {
  await connection();
  const { site, key } = await ctx.params;
  if (decodeURIComponent(site) !== "_platform" || env.mcpToken.length < 32) return notFound();
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const token = bearer ?? (key?.length === 1 ? decodeURIComponent(key[0]) : "");
  if (!token || !safeEqual(token, env.mcpToken)) return notFound();

  // Stateless: no standalone event stream (it would only hold a function open) and no sessions to end.
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const server = buildMcpServer(`${proto}://${host}`);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
