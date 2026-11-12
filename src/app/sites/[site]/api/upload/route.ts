import { connection } from "next/server";
import { checkUploadLink } from "@/lib/server/upload-link";
import { ImageError, SLUG_RE, storeImage } from "@/lib/server/admin-ops";
import { requestOrigin } from "@/lib/server/oauth";

/**
 * Receives photos for a teacher with a signed link handed out by the MCP server
 * (create_upload_link): from the /upload page (link fields in the form), or straight from
 * an agent that has the files (link fields in the address):
 *   curl -F "file=@photo.jpg" "https://<platform>/api/upload?t=…&e=…&s=…"
 */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/upload">) {
  await connection();
  const site = decodeURIComponent((await ctx.params).site);
  const form = await req.formData().catch(() => null);
  const q = new URL(req.url).searchParams;
  const part = (k: string) => q.get(k) ?? form?.get(k);
  const slug = site === "_platform" ? checkUploadLink(part("t"), part("e"), part("s")) : null;
  if (!slug || !SLUG_RE.test(slug)) return Response.json({ error: "الرابط غير صالح أو انتهت صلاحيته.", error_en: "The upload link is invalid or expired: get a new one with create_upload_link." }, { status: 403 });
  if (!form) return Response.json({ error: "ابعت الصور كـ multipart/form-data.", error_en: "Send the images as multipart/form-data, each in a field named \"file\"." }, { status: 400 });

  const files = form.getAll("file").filter((f): f is File => f instanceof File).slice(0, 30);
  if (!files.length) return Response.json({ error: "مفيش صور في الطلب.", error_en: "No files: send each image in a multipart field named \"file\"." }, { status: 400 });
  const origin = requestOrigin(req);
  const results: { name: string; key?: string; url?: string; error?: string }[] = [];
  for (const f of files) {
    try {
      const stored = await storeImage(slug, new Uint8Array(await f.arrayBuffer()), f.type || undefined, f.name);
      results.push({ name: f.name, key: stored.key, url: stored.url.startsWith("/") ? `${origin}${stored.url}` : stored.url });
    } catch (e) {
      results.push({ name: f.name, error: e instanceof ImageError ? e.message : "تعذّر رفع الصورة." });
      if (!(e instanceof ImageError)) console.error(e);
    }
  }
  return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
