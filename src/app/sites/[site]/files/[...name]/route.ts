import { connection } from "next/server";
import { siteFileFor } from "@/lib/server/site-files";
import { siteFileType } from "@/lib/site-files";

/**
 * Serves a teacher's site files at the root of their site (the proxy rewrites
 * /google123.html to here). HTML is served sandboxed: it can't run scripts on the
 * teacher's domain, which is all verification files need.
 */
export async function GET(_req: Request, ctx: RouteContext<"/sites/[site]/files/[...name]">) {
  await connection();
  const { site, name } = await ctx.params;
  const path = name.map(decodeURIComponent).join("/");
  const content = await siteFileFor(decodeURIComponent(site), path);
  if (content === null) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(content, {
    headers: {
      "Content-Type": siteFileType(path, content),
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=300",
    },
  });
}
