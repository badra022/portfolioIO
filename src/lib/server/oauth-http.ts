import "server-only";

/** JSON for the OAuth endpoints: no caching, readable from any origin (Claude may call from a browser). */
export const oauthJson = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" },
});

export const preflight = () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "86400" } });

export const platformOnly = async (params: Promise<{ site: string }>) => decodeURIComponent((await params).site) === "_platform";
