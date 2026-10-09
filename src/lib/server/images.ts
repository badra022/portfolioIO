import "server-only";
import sharp from "sharp";

/**
 * Every uploaded image (admin panel, photo upload page, MCP) goes through here
 * before it's stored: turned upright (phone EXIF orientation), scaled down to
 * what the site can show, re-encoded as WebP and stripped of metadata (phone
 * photos carry GPS location and camera details).
 */

/** Longest side kept. Covers full-width images on a 2x (retina) screen. */
const MAX_SIDE = 1600;
/** Tall screenshots (reviews, chat captures) keep more height so text stays readable. */
const MAX_TALL = 2600;
const QUALITY = 80;
/** Biggest input accepted (pixels), so a crafted image can't exhaust memory. */
const MAX_PIXELS = 50_000_000;

export type Optimized = { bytes: Uint8Array; type: "image/webp"; width: number; height: number };

export async function optimizeImage(input: Uint8Array): Promise<Optimized> {
  const meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  const animated = (meta.pages ?? 1) > 1;
  const tall = (meta.height ?? 0) > (meta.width ?? 0) * 1.8;
  const out = await sharp(input, { animated, limitInputPixels: MAX_PIXELS })
    .rotate() // apply EXIF orientation, then the EXIF is dropped
    .resize({ width: MAX_SIDE, height: tall ? MAX_TALL : MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 4, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });
  return { bytes: new Uint8Array(out.data), type: "image/webp", width: out.info.width, height: out.info.height };
}
