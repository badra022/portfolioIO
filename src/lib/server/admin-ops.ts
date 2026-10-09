import "server-only";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { assetUrl } from "./assets";
import { putObject } from "./storage";
import { optimizeImage, type Optimized } from "./images";
import * as repo from "./repo";

/**
 * Rules shared by the admin panel (server actions) and the MCP server, so both
 * accept exactly the same input.
 */

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
}

/** Where this teacher logs in: their main domain, else <slug>.<ROOT_DOMAIN>, else the preview path on this host. */
export async function loginUrlFor(slug: string): Promise<string> {
  const t = await repo.getTenant(slug);
  const primary = t?.domains.find((d) => d.isPrimary)?.domain ?? t?.domains[0]?.domain;
  if (primary) return `https://${primary}/admin`;
  if (env.rootDomain) return `https://${slug}.${env.rootDomain}/admin`;
  return `/t/${slug}/admin`;
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

export const IMAGE_TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/webp": { ext: "webp", magic: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" },
  "image/gif": { ext: "gif", magic: (b) => String.fromCharCode(...b.slice(0, 4)) === "GIF8" },
  "image/avif": { ext: "avif", magic: (b) => String.fromCharCode(...b.slice(4, 8)) === "ftyp" },
};
/** Largest original accepted. Images are compressed before storing (lib/server/images.ts), so the stored file is far smaller. */
export const MAX_INPUT = 20 * 1024 * 1024;

/** The image type of some bytes, by their first bytes (the declared type is not trusted). */
export function sniffImage(bytes: Uint8Array): string | null {
  return Object.entries(IMAGE_TYPES).find(([, t]) => t.magic(bytes))?.[0] ?? null;
}

export class ImageError extends Error {}

/**
 * Validates, compresses (WebP, scaled down, metadata stripped) and stores an image
 * in the teacher's folder. Returns the key to put in an image field (and its
 * public URL). Messages are Arabic for the admin panel.
 */
export async function storeImage(slug: string, bytes: Uint8Array, declaredType?: string, name?: string): Promise<{ key: string; url: string }> {
  if (declaredType && !IMAGE_TYPES[declaredType]) throw new ImageError("الصيغ المسموحة: JPG, PNG, WEBP, GIF, AVIF.");
  if (bytes.byteLength > MAX_INPUT) throw new ImageError("الحد الأقصى لحجم الصورة 20 ميجابايت.");
  const type = sniffImage(bytes);
  if (!type || (declaredType && declaredType !== type)) throw new ImageError("الملف ليس صورة صالحة.");
  // The original file name (made safe) stays in the key, so a list of uploads is readable.
  const label = (name ?? "").replace(/\.[a-z0-9]+$/i, "").normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40);
  let out: Optimized;
  try { out = await optimizeImage(bytes); } catch { throw new ImageError("الملف ليس صورة صالحة."); }
  const key = `uploads/${Date.now().toString(36)}-${randomBytes(3).toString("hex")}${label ? `-${label}` : ""}.webp`;
  await putObject(slug, key, out.bytes, out.type);
  return { key, url: assetUrl(slug, key) };
}
