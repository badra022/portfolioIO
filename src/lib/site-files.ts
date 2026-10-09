/**
 * Site files: small text files a teacher's site serves from its root, e.g.
 * Google/Bing verification (google123.html, BingSiteAuth.xml), an IndexNow key
 * (abc.txt), ads.txt or .well-known/… files. Managed by the super admin (console
 * or MCP), stored in the database (tenant_files), served per domain.
 */

/** Root-level name with a text extension, or anything under .well-known/. */
export const SITE_FILE_RE = /^(?:\.well-known\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}|[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(?:html?|txt|xml|json))$/;

/** Paths the site already serves itself. */
export const RESERVED_FILES = new Set(["robots.txt", "sitemap.xml", "og.png", "favicon.ico"]);

export const MAX_SITE_FILE = 64 * 1024;

export const isSiteFileName = (name: string) => SITE_FILE_RE.test(name) && !RESERVED_FILES.has(name.toLowerCase());

/** What the browser/crawler is told the file is. */
export function siteFileType(name: string, content: string): string {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "html" || ext === "htm") return "text/html; charset=utf-8";
  if (ext === "xml") return "application/xml; charset=utf-8";
  if (ext === "json") return "application/json; charset=utf-8";
  if (ext === "txt") return "text/plain; charset=utf-8";
  // .well-known files without an extension (e.g. apple-app-site-association) are usually JSON.
  try { JSON.parse(content); return "application/json"; } catch { return "text/plain; charset=utf-8"; }
}
