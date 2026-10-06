import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { safeEqual } from "./passwords";

/**
 * Signed links to the photo upload page (/upload). The MCP server hands one out
 * so someone can drop a teacher's photos from their phone or computer; the link
 * only works for that teacher and until it expires. Signed with MCP_TOKEN.
 */
const sign = (slug: string, exp: number) => createHmac("sha256", `upload:${env.mcpToken}`).update(`${slug}.${exp}`).digest("base64url");

export function makeUploadLink(origin: string, slug: string, hours: number): { url: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + Math.round(hours * 3600);
  const q = new URLSearchParams({ t: slug, e: String(exp), s: sign(slug, exp) });
  return { url: `${origin}/upload?${q}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** The teacher slug a link is valid for, or null (bad signature, expired, MCP off). */
export function checkUploadLink(slug: unknown, exp: unknown, sig: unknown): string | null {
  if (!env.mcpToken || typeof slug !== "string" || typeof sig !== "string") return null;
  const e = Number(exp);
  if (!Number.isFinite(e) || e * 1000 < Date.now()) return null;
  return safeEqual(sig, sign(slug, e)) ? slug : null;
}
