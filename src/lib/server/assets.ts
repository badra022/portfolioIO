import "server-only";
import { env, hasSupabaseStorage } from "@/lib/env";
import { mapImages } from "@/lib/content-utils";
import type { Content } from "@/lib/schema";

/** Where a teacher's files are served from: Supabase Storage in production, /local-assets when developing. */
export function assetBase(slug: string): string {
  return hasSupabaseStorage()
    ? `${env.supabaseUrl}/storage/v1/object/public/${env.storageBucket}/${slug}`
    : `/local-assets/${slug}`;
}

/** Image values are keys inside the teacher's folder ("teacher.webp", "uploads/...") or absolute URLs. */
export function assetUrl(slug: string, key: string): string {
  if (!key || /^https?:\/\//.test(key) || key.startsWith("/")) return key;
  return `${assetBase(slug)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export const resolveImages = (content: Content, slug: string) => mapImages(content, (v) => assetUrl(slug, v));
