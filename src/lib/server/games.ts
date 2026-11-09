import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";

const { gameFiles, tenants } = schema;

/**
 * Learning games (content.games): each game is ONE self-contained HTML file (its
 * script, styles and small assets inline; libraries from a public CDN), uploaded from
 * the admin panel or by Claude (MCP upload_game) and referenced as "game:<id>".
 * Files never change after upload. They are only ever served inside a sandboxed frame
 * with an opaque origin (app/sites/[site]/games/[path]/play), so a game can't read
 * the site's cookies, storage or admin session.
 */
export const MAX_GAME_BYTES = 3 * 1024 * 1024;
export const GAME_KEY = /^game:([0-9a-f-]{36})$/;

export class GameFileError extends Error {}

export type GameFileInfo = { key: string; name: string; bytes: number; createdAt: string; createdBy: string | null };

async function tenantIdOf(slug: string): Promise<string> {
  const id = (await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0]?.id;
  if (!id) throw new GameFileError("Teacher not found.");
  return id;
}

/** Checks an uploaded game: a text HTML document within the size limit. */
export function checkGameHtml(html: string): string {
  const text = html.replace(/^﻿/, "");
  if (!text.trim()) throw new GameFileError("الملف فاضي.");
  if (Buffer.byteLength(text) > MAX_GAME_BYTES) throw new GameFileError(`ملف اللعبة أكبر من ${MAX_GAME_BYTES / 1024 / 1024} ميجا. صغّر الصور أو حمّل المكتبات من رابط CDN بدل ما تكون جوه الملف.`);
  if (text.includes("\u0000")) throw new GameFileError("الملف لازم يكون نص HTML (مش صورة أو ملف مضغوط).");
  if (!/<(!doctype html|html|body|script|canvas|div)\b/i.test(text.slice(0, 20000))) throw new GameFileError("ده مش ملف HTML. اللعبة لازم تكون ملف ‎.html‎ واحد.");
  return text;
}

/** Stores a new game file for a teacher and returns its key ("game:<id>"). */
export async function saveGameFile(slug: string, rawName: string, html: string, author: string): Promise<GameFileInfo> {
  if (!hasDb()) throw new GameFileError("No database.");
  const text = checkGameHtml(html);
  const name = (rawName || "game.html").replace(/[^\w.\- ]+/g, "-").slice(0, 80) || "game.html";
  const tenantId = await tenantIdOf(slug);
  const [row] = await db().insert(gameFiles).values({ tenantId, name, html: text, bytes: Buffer.byteLength(text), createdBy: author })
    .returning({ id: gameFiles.id, createdAt: gameFiles.createdAt });
  return { key: `game:${row.id}`, name, bytes: Buffer.byteLength(text), createdAt: row.createdAt.toISOString(), createdBy: author };
}

/** A teacher's game file by key (null when it doesn't exist or belongs to another teacher). */
export async function readGameFile(tenantId: string, key: string): Promise<string | null> {
  const id = key.match(GAME_KEY)?.[1];
  if (!id || !hasDb()) return null;
  const row = (await db().select({ html: gameFiles.html }).from(gameFiles).where(and(eq(gameFiles.id, id), eq(gameFiles.tenantId, tenantId))).limit(1))[0];
  return row?.html ?? null;
}

/** A teacher's uploaded game files, newest first (without their contents). */
export async function listGameFiles(slug: string): Promise<GameFileInfo[]> {
  if (!hasDb()) return [];
  const rows = await db().select({ id: gameFiles.id, name: gameFiles.name, bytes: gameFiles.bytes, createdAt: gameFiles.createdAt, createdBy: gameFiles.createdBy })
    .from(gameFiles).innerJoin(tenants, eq(tenants.id, gameFiles.tenantId))
    .where(eq(tenants.slug, slug)).orderBy(desc(gameFiles.createdAt)).limit(200);
  return rows.map((r) => ({ key: `game:${r.id}`, name: r.name, bytes: r.bytes, createdAt: r.createdAt.toISOString(), createdBy: r.createdBy }));
}

/** Details of one file (for the admin form). */
export async function gameFileInfo(slug: string, key: string): Promise<GameFileInfo | null> {
  const id = key.match(GAME_KEY)?.[1];
  if (!id || !hasDb()) return null;
  const row = (await db().select({ id: gameFiles.id, name: gameFiles.name, bytes: gameFiles.bytes, createdAt: gameFiles.createdAt, createdBy: gameFiles.createdBy })
    .from(gameFiles).innerJoin(tenants, eq(tenants.id, gameFiles.tenantId))
    .where(and(eq(tenants.slug, slug), eq(gameFiles.id, id))).limit(1))[0];
  return row ? { key, name: row.name, bytes: row.bytes, createdAt: row.createdAt.toISOString(), createdBy: row.createdBy } : null;
}

/**
 * The headers a game is served with: its own sandbox (an opaque origin even if opened
 * directly), no network but public CDNs for scripts and fonts, images and media from
 * anywhere over https, and only framed by the teacher's own pages.
 */
export const GAME_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": [
    "sandbox allow-scripts allow-pointer-lock",
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
    "style-src 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
    "font-src data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
    "img-src data: blob: https:",
    "media-src data: blob: https:",
    "worker-src blob:",
    "connect-src data: blob:",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "public, max-age=300",
};
