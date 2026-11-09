import { connection } from "next/server";
import { getSiteData } from "@/lib/server/site";
import { activeTenantId } from "@/lib/server/analytics";
import { GAME_HEADERS, readGameFile } from "@/lib/server/games";
import { liveGame } from "@/lib/library";

/**
 * A game's own file, only ever inside the frame on its page (components/GamePlayer.tsx).
 * The response carries its own sandbox (lib/server/games.ts GAME_HEADERS): even opened
 * directly, it runs with an opaque origin, without the site's cookies or storage.
 */
export async function GET(_req: Request, ctx: RouteContext<"/sites/[site]/games/[path]/play">) {
  await connection();
  const { site, path } = await ctx.params;
  const data = await getSiteData(decodeURIComponent(site));
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  if (data.kind !== "tenant" || !data.permissions.library) return notFound();
  const game = liveGame(data.content, decodeURIComponent(path), Infinity);
  if (!game?.file) return notFound();
  const tenantId = await activeTenantId(data.slug);
  const html = tenantId ? await readGameFile(tenantId, game.file) : null;
  if (!html) return notFound();
  return new Response(html, { headers: GAME_HEADERS });
}
