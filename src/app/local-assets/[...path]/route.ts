import fs from "node:fs/promises";
import path from "node:path";
import { LOCAL_STORAGE_DIR } from "@/lib/server/storage";
import { mimeFor } from "@/lib/server/bundled";

/**
 * Development-only file server for images when Supabase Storage isn't configured.
 * Files live in .local-storage/<slug>/... (filled by scripts/prepare-local-assets.mjs and admin uploads).
 */
export async function GET(_req: Request, ctx: RouteContext<"/local-assets/[...path]">) {
  if (process.env.VERCEL) return new Response("Not found", { status: 404 });
  const parts = (await ctx.params).path.map((p) => decodeURIComponent(p));
  const file = path.join(LOCAL_STORAGE_DIR, ...parts);
  if (!file.startsWith(LOCAL_STORAGE_DIR + path.sep)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await fs.readFile(file);
    return new Response(bytes, { headers: { "Content-Type": mimeFor(file), "Cache-Control": "no-cache" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
