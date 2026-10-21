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
 *   /oauth/register   dynamic client registration (Claude registers itself), or the client's
 *                     published identity instead: a client_id that is the https URL of its
 *                     metadata document (CIMD), read from there
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
    client_id_metadata_document_supported: true,
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

/** A registered callback matches exactly; a loopback one (http://localhost/...) on any port (RFC 8252), as desktop apps pick a free port. */
function sameRedirect(registered: string, asked: string): boolean {
  if (registered === asked) return true;
  try {
    const r = new URL(registered), a = new URL(asked);
    const loop = (u: URL) => u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
    return loop(r) && loop(a) && r.hostname === a.hostname && r.pathname === a.pathname && r.search === a.search;
  } catch { return false; }
}

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

const signedClient = (clientId: string | null) => readToken<Client>("oauth-client", clientId);

/**
 * A client known by its published metadata (CIMD): client_id is an https URL whose JSON says
 * the same client_id and lists the redirect_uris. Only public names (no IP addresses, no
 * localhost), no redirects, small and quick; remembered for 10 minutes.
 */
const cimdCache = new Map<string, { c: Client | null; until: number }>();
const isCimdUrl = (id: string) => {
  try {
    const u = new URL(id);
    return u.protocol === "https:" && u.pathname !== "/" && !u.username && !u.password && !u.hash
      && /\.[a-z]{2,}$/i.test(u.hostname) && u.hostname !== "localhost" && !/^[\d.]+$/.test(u.hostname) && !u.hostname.includes(":");
  } catch { return false; }
};

async function metadataClient(clientId: string): Promise<Client | null> {
  const hit = cimdCache.get(clientId);
  if (hit && hit.until > Date.now()) return hit.c;
  let c: Client | null = null;
  try {
    const res = await fetch(clientId, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
    const text = res.ok ? await res.text() : "";
    if (text && text.length < 64 * 1024) {
      const doc = JSON.parse(text) as { client_id?: unknown; redirect_uris?: unknown; client_name?: unknown };
      const ru = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter((x): x is string => typeof x === "string" && okRedirect(x)) : [];
      if (doc.client_id === clientId && ru.length) c = { ru: ru.slice(0, 20), n: typeof doc.client_name === "string" ? doc.client_name.slice(0, 80) : new URL(clientId).hostname };
    }
  } catch (e) {
    console.error("[oauth] client metadata", clientId, e instanceof Error ? e.message : e);
  }
  if (cimdCache.size > 100) cimdCache.clear();
  cimdCache.set(clientId, { c, until: Date.now() + (c ? 600_000 : 60_000) });
  return c;
}

/** The client behind a client_id: one we registered (a signed token), or a published metadata URL. */
export async function readClient(clientId: string | null): Promise<Client | null> {
  if (!clientId) return null;
  return signedClient(clientId) ?? (isCimdUrl(clientId) ? metadataClient(clientId) : null);
}

/** What /oauth/authorize was asked for, checked: the client, its callback, and PKCE. */
export type AuthorizeRequest = { clientId: string; clientName: string; redirectUri: string; state: string; challenge: string };

export async function checkAuthorize(q: URLSearchParams): Promise<{ ok: true; req: AuthorizeRequest } | { ok: false; error: string }> {
  const clientId = q.get("client_id") ?? "";
  const client = await readClient(clientId);
  if (!client) return { ok: false, error: "Unknown client. Remove the connector in Claude and add it again." };
  const redirectUri = q.get("redirect_uri") ?? client.ru[0];
  if (!client.ru.some((r) => sameRedirect(r, redirectUri))) return { ok: false, error: "This redirect_uri isn't registered for the client." };
  if ((q.get("response_type") ?? "code") !== "code") return { ok: false, error: "Only response_type=code is supported." };
  const challenge = q.get("code_challenge") ?? "";
  if (!challenge || (q.get("code_challenge_method") ?? "S256") !== "S256") return { ok: false, error: "PKCE (S256) is required." };
  return { ok: true, req: { clientId, clientName: client.n, redirectUri, state: q.get("state") ?? "", challenge } };
}

/** A short fingerprint of a client_id, so a code only works for the client it was issued to. */
const clientTag = (clientId: string) => pkceChallenge(clientId).slice(0, 24);

export function issueCode(who: Identity, r: AuthorizeRequest): string {
  return signToken("oauth-code", { who, cid: clientTag(r.clientId), ru: r.redirectUri, cc: r.challenge }, CODE_SECONDS);
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
    if (clientId && clientTag(clientId) !== code.cid) return { ok: false, error: "invalid_grant", description: "The code belongs to another client." };
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
