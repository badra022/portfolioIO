import "server-only";
import { env } from "@/lib/env";
import { findLoginById, listTenants } from "./repo";
import { getPartnerById } from "./partners";
import { pkceChallenge, readToken, signToken } from "./tokens";
import type { Identity } from "./session";

/**
 * OAuth 2.1 for the MCP server (app/sites/[site]/api/mcp), so a partner adds myostaz as a
 * custom connector in Claude and signs in with their own myostaz login: no secret in
 * the link, and the connector only reaches that partner's teachers.
 *
 *   /.well-known/oauth-protected-resource   which server signs in for /api/mcp
 *   /.well-known/oauth-authorization-server the endpoints below
 *   /oauth/register   dynamic client registration (Claude registers itself)
 *   /oauth/authorize  the login page, then «اسمح» (app/sites/[site]/oauth/authorize)
 *   /oauth/token      code (+ PKCE) → access and refresh tokens; refresh → new tokens
 *
 * Everything is a signed token (lib/server/tokens.ts); nothing is stored. The super
 * admin can still use the MCP_TOKEN link.
 */
export const ACCESS_SECONDS = 3600;
export const REFRESH_SECONDS = 30 * 86400;
const CODE_SECONDS = 300;

export function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : url.protocol.replace(":", ""));
  return `${proto}://${host}`;
}

export const resourceUrl = (origin: string) => `${origin}/api/mcp`;

export function protectedResourceMetadata(origin: string) {
  return { resource: resourceUrl(origin), authorization_servers: [origin], bearer_methods_supported: ["header"], scopes_supported: ["mcp"], resource_name: "myostaz.com" };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  };
}

/* ---------------- clients (dynamic registration) ---------------- */

type Client = { ru: string[]; n: string };

/** Only https callbacks (or http on localhost, for testing tools). */
const okRedirect = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" || (x.protocol === "http:" && (x.hostname === "localhost" || x.hostname === "127.0.0.1"));
  } catch { return false; }
};

export function registerClient(body: { redirect_uris?: unknown; client_name?: unknown }): { ok: true; client: Record<string, unknown> } | { ok: false; error: string } {
  const ru = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((x): x is string => typeof x === "string") : [];
  if (!ru.length || ru.length > 10 || !ru.every(okRedirect)) return { ok: false, error: "redirect_uris must be https URLs" };
  const n = typeof body.client_name === "string" ? body.client_name.slice(0, 80) : "MCP client";
  const clientId = signToken("oauth-client", { ru, n }, 10 * 365 * 86400);
  return {
    ok: true,
    client: { client_id: clientId, client_name: n, redirect_uris: ru, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", client_id_issued_at: Math.floor(Date.now() / 1000) },
  };
}

export const readClient = (clientId: string | null) => readToken<Client>("oauth-client", clientId);

/** What /oauth/authorize was asked for, checked: the client, its callback, and PKCE. */
export type AuthorizeRequest = { clientId: string; clientName: string; redirectUri: string; state: string; challenge: string };

export function checkAuthorize(q: URLSearchParams): { ok: true; req: AuthorizeRequest } | { ok: false; error: string } {
  const clientId = q.get("client_id") ?? "";
  const client = readClient(clientId);
  if (!client) return { ok: false, error: "Unknown client. Remove the connector in Claude and add it again." };
  const redirectUri = q.get("redirect_uri") ?? client.ru[0];
  if (!client.ru.includes(redirectUri)) return { ok: false, error: "This redirect_uri isn't registered for the client." };
  if ((q.get("response_type") ?? "code") !== "code") return { ok: false, error: "Only response_type=code is supported." };
  const challenge = q.get("code_challenge") ?? "";
  if (!challenge || (q.get("code_challenge_method") ?? "S256") !== "S256") return { ok: false, error: "PKCE (S256) is required." };
  return { ok: true, req: { clientId, clientName: client.n, redirectUri, state: q.get("state") ?? "", challenge } };
}

export function issueCode(who: Identity, r: AuthorizeRequest): string {
  return signToken("oauth-code", { who, cid: r.clientId.slice(-24), ru: r.redirectUri, cc: r.challenge }, CODE_SECONDS);
}

/* ---------------- tokens ---------------- */

type TokenPair = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string };

function pair(who: Identity): TokenPair {
  return {
    access_token: signToken("oauth-access", { who }, ACCESS_SECONDS),
    token_type: "Bearer",
    expires_in: ACCESS_SECONDS,
    refresh_token: signToken("oauth-refresh", { who }, REFRESH_SECONDS),
    scope: "mcp",
  };
}

export type TokenResult = { ok: true; tokens: TokenPair } | { ok: false; error: string; description: string };

export async function exchange(form: URLSearchParams): Promise<TokenResult> {
  const grant = form.get("grant_type");
  if (grant === "authorization_code") {
    const code = readToken<{ who: Identity; cid: string; ru: string; cc: string }>("oauth-code", form.get("code"));
    if (!code) return { ok: false, error: "invalid_grant", description: "The code is wrong or expired." };
    const clientId = form.get("client_id") ?? "";
    if (clientId && clientId.slice(-24) !== code.cid) return { ok: false, error: "invalid_grant", description: "The code belongs to another client." };
    if ((form.get("redirect_uri") ?? code.ru) !== code.ru) return { ok: false, error: "invalid_grant", description: "redirect_uri doesn't match." };
    const verifier = form.get("code_verifier") ?? "";
    if (!verifier || pkceChallenge(verifier) !== code.cc) return { ok: false, error: "invalid_grant", description: "PKCE check failed." };
    if (!(await stillAllowed(code.who))) return { ok: false, error: "invalid_grant", description: "This account can't sign in." };
    return { ok: true, tokens: pair(code.who) };
  }
  if (grant === "refresh_token") {
    const t = readToken<{ who: Identity }>("oauth-refresh", form.get("refresh_token"));
    if (!t || !(await stillAllowed(t.who))) return { ok: false, error: "invalid_grant", description: "Sign in again." };
    return { ok: true, tokens: pair(t.who) };
  }
  return { ok: false, error: "unsupported_grant_type", description: "authorization_code or refresh_token." };
}

/** The account behind an MCP access token, if the token is valid and the account still allowed. */
export async function accessIdentity(token: string): Promise<Identity | null> {
  const t = readToken<{ who: Identity }>("oauth-access", token);
  return t && (await stillAllowed(t.who)) ? t.who : null;
}

async function stillAllowed(who: Identity): Promise<boolean> {
  if (who.k === "s") return Boolean(env.adminUser);
  if (who.k === "p") { const p = await getPartnerById(who.id); return Boolean(p && !p.disabled); }
  const l = await findLoginById(who.id);
  return Boolean(l && !l.disabled);
}

/* ---------------- what an MCP session may reach ---------------- */

/** The MCP server's reach: everything (super admin), or a set of teacher sites. */
export type McpScope = { kind: "super" } | { kind: "partner" | "teacher"; name: string; slugs: Set<string> };

export async function scopeOf(who: Identity): Promise<McpScope | null> {
  if (who.k === "s") return { kind: "super" };
  if (who.k === "p") {
    const p = await getPartnerById(who.id);
    if (!p || p.disabled) return null;
    const slugs = new Set((await listTenants()).filter((t) => t.partnerId === p.id).map((t) => t.slug));
    return { kind: "partner", name: p.name, slugs };
  }
  const l = await findLoginById(who.id);
  return l && !l.disabled ? { kind: "teacher", name: l.username, slugs: new Set([l.slug]) } : null;
}
