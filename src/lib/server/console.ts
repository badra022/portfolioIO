import "server-only";
import { env } from "@/lib/env";
import { listTenants, listTrialRequests, type TrialRequestRow } from "./repo";
import { overview } from "./analytics";
import { tenantState } from "@/lib/admin/tenant-actions";
import { langOf } from "@/lib/i18n";
import type { TenantRow } from "@/components/admin/TenantsTable";

/** Where students open a teacher's site: the main domain, else <slug>.<ROOT_DOMAIN>, else /t/<slug>. */
export function siteAddress(slug: string, domains: { domain: string; isPrimary: boolean }[]): { url: string; label: string } {
  const primary = domains.find((d) => d.isPrimary)?.domain ?? domains[0]?.domain;
  if (primary) return { url: `https://${primary}`, label: primary };
  if (env.rootDomain) return { url: `https://${slug}.${env.rootDomain}`, label: `${slug}.${env.rootDomain}` };
  return { url: `/t/${slug}`, label: `/t/${slug}` };
}

/** The super admin's data: every teacher as a table row, and every trial request. */
export async function consoleData(): Promise<{ rows: TenantRow[]; trials: TrialRequestRow[] }> {
  const [tenants, stats, trials] = await Promise.all([listTenants(), overview().catch(() => []), listTrialRequests().catch(() => [])]);
  const visitors = new Map(stats.map((s) => [s.slug, s.visitors]));
  const fromTrial = new Set(trials.map((t) => t.slug));
  const now = Date.now();
  const rows = tenants.map((t): TenantRow => {
    const a = siteAddress(t.slug, t.domains);
    return {
      slug: t.slug, name: t.name, state: tenantState(t, now), trialEndsAt: t.trialEndsAt, siteUrl: a.url, siteLabel: a.label,
      users: t.users, createdAt: t.createdAt, updatedAt: t.updatedAt, english: langOf(t.locale) === "en",
      visitors: visitors.get(t.slug) ?? 0, fromTrial: fromTrial.has(t.slug),
    };
  }).sort((x, y) => (y.createdAt ?? "").localeCompare(x.createdAt ?? ""));
  return { rows, trials };
}
