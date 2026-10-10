/**
 * Two environments share one deployment and one database:
 * - production: the public site everyone sees.
 * - preview: a private copy of the teacher's page at <site>/preview, open only to
 *   the people who can log into the admin panel. Edits saved "to preview" show
 *   there first; "publish" copies them to production. Everything the page
 *   collects (requests, quiz attempts, analytics, result lookups) is kept per
 *   environment, so testing in preview never mixes with real students.
 *
 * Inside the app a preview request uses the site key with a "~preview" suffix
 * (see lib/routing.ts), e.g. "d.teacher.com~preview".
 */
export const ENVS = ["production", "preview"] as const;
export type SiteEnv = (typeof ENVS)[number];

export const ENV_LABEL: Record<SiteEnv, string> = { production: "الموقع (production)", preview: "المعاينة (preview)" };

export const PREVIEW_PATH = "/preview";
const SUFFIX = "~preview";

export const isEnv = (v: unknown): v is SiteEnv => v === "production" || v === "preview";

/** The site key without its environment, and the environment. */
export function splitSite(site: string): { key: string; env: SiteEnv } {
  return site.endsWith(SUFFIX) ? { key: site.slice(0, -SUFFIX.length), env: "preview" } : { key: site, env: "production" };
}

export const siteEnv = (site: string): SiteEnv => splitSite(site).env;

/** The site key for an environment (production keys have no suffix). */
export const withEnv = (site: string, env: SiteEnv) => (env === "preview" ? `${splitSite(site).key}${SUFFIX}` : splitSite(site).key);

/** Cookie holding the environment the admin panel shows data for. */
export const ENV_COOKIE = "admin_env";
