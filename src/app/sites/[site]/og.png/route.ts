import { connection } from "next/server";
import sharp, { type OverlayOptions } from "sharp";
import { getSiteData } from "@/lib/server/site";
import { fetchImage } from "@/lib/server/mcp/fetch-image";

const W = 1200, H = 630;

/** Teacher images are on our storage (absolute) or, when developing, under /local-assets on this host. */
async function load(src: string | undefined, req: Request): Promise<Buffer | null> {
  if (!src) return null;
  try {
    if (src.startsWith("/")) {
      const res = await fetch(new URL(src, req.url), { signal: AbortSignal.timeout(8000) });
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    }
    return Buffer.from(await fetchImage(src));
  } catch {
    return null;
  }
}

/**
 * The share image (WhatsApp, Facebook, Google) for teachers who didn't upload one:
 * their photo and logo on their theme colors, 1200x630. No text: the title and
 * description travel with the link, and Arabic text can't be shaped reliably here.
 */
export async function GET(req: Request, ctx: RouteContext<"/sites/[site]/og.png">) {
  await connection();
  const data = await getSiteData(decodeURIComponent((await ctx.params).site));
  if (data.kind !== "tenant") return new Response("Not found", { status: 404 });
  const { colors } = data.theme;
  const { profile } = data.content;

  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <radialGradient id="g" cx="78%" cy="55%" r="65%"><stop offset="0" stop-color="${colors.accentDeep}"/><stop offset="1" stop-color="${colors.bg}"/></radialGradient>
      <linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="${colors.bg}" stop-opacity="1"/><stop offset="0.35" stop-color="${colors.bg}" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="0" y="${H - 14}" width="${W}" height="14" fill="${colors.accent}"/>
  </svg>`);
  const layers: OverlayOptions[] = [];
  const photo = await load(profile.photo, req);
  if (photo) {
    const pw = 600;
    layers.push({ input: await sharp(photo).rotate().resize(pw, H - 14, { fit: "cover", position: "top" }).toBuffer(), left: W - pw, top: 0 });
    // Blend the photo's inner edge into the background.
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${H - 14}"><defs><linearGradient id="f" x1="0" x2="1"><stop offset="0" stop-color="${colors.bg}"/><stop offset="0.4" stop-color="${colors.bg}" stop-opacity="0"/></linearGradient></defs><rect width="${pw}" height="${H - 14}" fill="url(#f)"/></svg>`), left: W - pw, top: 0 });
  }
  const mark = await load(profile.logo ?? profile.avatar, req);
  if (mark) {
    layers.push({ input: await sharp(mark).resize(420, 260, { fit: "inside", withoutEnlargement: false }).toBuffer(), left: 80, top: Math.round((H - 260) / 2) });
  }
  const jpg = await sharp(background).composite(layers).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpg), {
    headers: {
      "Content-Type": "image/jpeg",
      // The URL carries ?v=<content version>, so a save gives a new URL; each version can be cached long.
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
    },
  });
}
