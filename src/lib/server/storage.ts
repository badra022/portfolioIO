import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env, hasSupabaseStorage } from "@/lib/env";

export const LOCAL_STORAGE_DIR = path.join(process.cwd(), ".local-storage");

function supabaseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = env.supabaseSecretKey;
  // New secret keys (sb_secret_...) go in `apikey` only; legacy service_role JWTs also need Authorization.
  return { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), ...extra };
}

/** Creates the public images bucket if it doesn't exist yet. */
export async function ensureBucket(): Promise<void> {
  if (!hasSupabaseStorage()) return;
  const res = await fetch(`${env.supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: supabaseHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      id: env.storageBucket, name: env.storageBucket, public: true,
      file_size_limit: 5 * 1024 * 1024,
      allowed_mime_types: ["image/webp", "image/png", "image/jpeg", "image/avif", "image/gif", "image/svg+xml", "application/pdf"],
    }),
  });
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    if (!/already exists|Duplicate/i.test(text)) throw new Error(`Could not create storage bucket: ${res.status} ${text}`);
  }
}

/** Stores a file at <slug>/<key>. */
export async function putObject(slug: string, key: string, bytes: Uint8Array, contentType: string, cacheSeconds = 31536000): Promise<void> {
  const objectPath = `${slug}/${key}`;
  if (hasSupabaseStorage()) {
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${env.storageBucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: supabaseHeaders({ "Content-Type": contentType, "x-upsert": "true", "cache-control": `max-age=${cacheSeconds}` }),
      body: Buffer.from(bytes),
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
    return;
  }
  if (process.env.VERCEL) throw new Error("File storage is not configured: set SUPABASE_URL and SUPABASE_SECRET_KEY.");
  const file = path.join(LOCAL_STORAGE_DIR, objectPath);
  if (!file.startsWith(LOCAL_STORAGE_DIR + path.sep)) throw new Error("Invalid path.");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
}
