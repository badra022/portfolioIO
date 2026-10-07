import { connection } from "next/server";
import { checkUploadLink } from "@/lib/server/upload-link";
import { ImageError, SLUG_RE, storeImage } from "@/lib/server/admin-ops";

/** Receives photos from the /upload page (a signed link handed out by the MCP server). */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/upload">) {
  await connection();
  const site = decodeURIComponent((await ctx.params).site);
  const form = await req.formData().catch(() => null);
  const slug = site === "_platform" && form ? checkUploadLink(form.get("t"), form.get("e"), form.get("s")) : null;
  if (!slug || !SLUG_RE.test(slug)) return Response.json({ error: "الرابط غير صالح أو انتهت صلاحيته." }, { status: 403 });

  const files = form!.getAll("file").filter((f): f is File => f instanceof File).slice(0, 30);
  const results: { name: string; key?: string; url?: string; error?: string }[] = [];
  for (const f of files) {
    try {
      results.push({ name: f.name, ...(await storeImage(slug, new Uint8Array(await f.arrayBuffer()), f.type || undefined, f.name)) });
    } catch (e) {
      results.push({ name: f.name, error: e instanceof ImageError ? e.message : "تعذّر رفع الصورة." });
      if (!(e instanceof ImageError)) console.error(e);
    }
  }
  return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
