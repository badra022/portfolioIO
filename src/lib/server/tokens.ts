import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Small signed tokens (HMAC-SHA256 over the JSON body), with a purpose and an expiry:
 * the login session cookie, OAuth client ids, authorization codes and access tokens
 * for the MCP server (lib/server/oauth.ts). Nothing is stored: a token is valid when
 * its signature checks and it hasn't expired. AUTH_SECRET (or, until it is set, the
 * other server secrets) signs them; changing it signs everyone out.
 */
const secret = () => process.env.AUTH_SECRET || process.env.SIGNUP_SALT || env.mcpToken || env.adminPassword || "portfolioio";

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const mac = (purpose: string, body: string) => createHmac("sha256", secret()).update(`${purpose}.${body}`).digest("base64url");

export function signToken(purpose: string, payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${body}.${mac(purpose, body)}`;
}

export function readToken<T extends Record<string, unknown>>(purpose: string, token: string | null | undefined): (T & { exp: number }) | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot), sig = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(mac(purpose, body));
  if (want.length !== sig.length || !timingSafeEqual(want, sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    return typeof data.exp === "number" && data.exp > Date.now() / 1000 ? data : null;
  } catch {
    return null;
  }
}

/** PKCE S256: base64url(sha256(verifier)). */
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
