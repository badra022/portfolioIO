import "server-only";
import { listTenants, listTrialRequests, type TrialRequestRow } from "./repo";
import { overview } from "./analytics";
import { siteAddress } from "./address";
import { listPartners, type Partner } from "./partners";
import { funnels } from "./funnel";
import { tenantState } from "@/lib/admin/tenant-actions";
import { formatWhen } from "@/lib/admin/format";
import { cairoDay } from "@/lib/analytics";
import { langOf } from "@/lib/i18n";
import type { TenantRow } from "@/components/admin/TenantsTable";
import type { TrialLead } from "@/components/admin/TrialsTable";

export type PartnerRef = { slug: string; name: string };

/** The super admin's data: every teacher as a table row, every trial request, and every partner. */
export async function consoleData(): Promise<{ rows: TenantRow[]; trials: TrialRequestRow[]; partners: Partner[] }> {
  const [tenants, stats, trials, partners] = await Promise.all([listTenants(), overview().catch(() => []), listTrialRequests().catch(() => []), listPartners().catch(() => [])]);
  const visits = new Map(stats.map((s) => [s.slug, s]));
  const fromTrial = new Set(trials.map((t) => t.slug));
  const byId = new Map(partners.map((p) => [p.id, { slug: p.slug, name: p.name }]));
  const now = Date.now();
  const rows = tenants.map((t): TenantRow => {
    const a = siteAddress(t.slug, t.domains);
    return {
      slug: t.slug, name: t.name, state: tenantState(t, now), trialEndsAt: t.trialEndsAt, siteUrl: a.url, siteLabel: a.label,
      users: t.users, createdAt: t.createdAt, updatedAt: t.updatedAt, english: langOf(t.locale) === "en",
      visitors: visits.get(t.slug)?.visitors ?? 0, contacts: visits.get(t.slug)?.contacts ?? 0, fromTrial: fromTrial.has(t.slug),
      partner: t.partnerId ? byId.get(t.partnerId) ?? null : null,
    };
  }).sort((x, y) => (y.createdAt ?? "").localeCompare(x.createdAt ?? ""));
  return { rows, trials, partners };
}

/** Trial requests as the trials table shows them: the lead, its partner, and its site's state now. */
export function trialLeads(rows: TenantRow[], trials: TrialRequestRow[], partners: Partner[], now = Date.now()): TrialLead[] {
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const byId = new Map(partners.map((p) => [p.id, { slug: p.slug, name: p.name }]));
  return trials.map((t): TrialLead => {
    const row = t.tenant ? bySlug.get(t.slug) : undefined;
    const a = row ? { url: row.siteUrl, label: row.siteLabel } : siteAddress(t.slug, []);
    const state: TrialLead["state"] = !t.tenant ? "deleted" : t.tenant.status !== "active" ? "off"
      : !t.tenant.trialEndsAt ? "activated" : Date.parse(t.tenant.trialEndsAt) > now ? "running" : "ended";
    return {
      id: t.id, createdAt: t.createdAt, createdLabel: formatWhen(t.createdAt), name: t.name, subject: t.subject, phone: t.phone, english: langOf(t.locale ?? "") === "en",
      username: t.username, notes: t.notes, slug: t.slug, siteUrl: a.url, siteLabel: a.label, state, trialEndsAt: t.tenant?.trialEndsAt ?? null,
      partner: t.partnerId ? byId.get(t.partnerId) ?? { slug: "", name: "شريك محذوف" } : null, extra: t.extra,
    };
  });
}

/** One sign-up source's numbers: the platform's home page ("") or a partner. */
export type SourceSummary = {
  source: string; name: string; partner: Partner | null;
  /** Its sign-up page, all time. */
  views: number; built: number;
  /** Trial requests made from it, and how their sites stand now. */
  trials: number; running: number; ended: number; activated: number;
  /** Sites that belong to it now (partners only) and their visitors / contacts this month. */
  sites: number; live: number; visitors: number; contacts: number;
};

/** Every source side by side, the home page first: what the partners table and the stats page show. */
export async function sourceSummaries(data?: Awaited<ReturnType<typeof consoleData>>): Promise<SourceSummary[]> {
  const { rows, trials, partners } = data ?? (await consoleData());
  const leads = trialLeads(rows, trials, partners);
  const f = await funnels(null, cairoDay(new Date())).catch(() => ({} as Awaited<ReturnType<typeof funnels>>));
  const make = (source: string, name: string, partner: Partner | null): SourceSummary => {
    const mine = leads.filter((l) => (partner ? l.partner?.slug === partner.slug : !l.partner));
    const sites = rows.filter((r) => (partner ? r.partner?.slug === partner.slug : false));
    // The home page's own sites: the ones its trials made (they have no partner).
    const own = partner ? sites : rows.filter((r) => !r.partner && r.fromTrial);
    return {
      source, name, partner, views: f[source]?.views ?? 0, built: f[source]?.built ?? 0,
      trials: mine.length, running: mine.filter((l) => l.state === "running").length, ended: mine.filter((l) => l.state === "ended").length,
      activated: mine.filter((l) => l.state === "activated").length,
      sites: own.length, live: own.filter((r) => r.state === "live").length,
      visitors: own.reduce((a, r) => a + r.visitors, 0), contacts: own.reduce((a, r) => a + r.contacts, 0),
    };
  };
  return [make("", "صفحة المنصة (myostaz.com)", null), ...partners.map((p) => make(p.slug, p.name, p))];
}
