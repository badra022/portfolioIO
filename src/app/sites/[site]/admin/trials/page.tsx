import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { formatWhen } from "@/lib/admin/format";
import { requireSuper } from "@/lib/server/auth";
import { consoleData, siteAddress } from "@/lib/server/console";
import { langOf } from "@/lib/i18n";
import { TrialsTable, type TrialLead } from "@/components/admin/TrialsTable";

export const metadata: Metadata = { title: "طلبات التجربة" };

/** Super admin, platform host: every request from the home page's trial form, with its site's state. */
export default async function Trials({ params }: PageProps<"/sites/[site]/admin/trials">) {
  const site = decodeURIComponent((await params).site);
  if (site !== "_platform") notFound();
  await requireSuper(site);
  await connection();
  const { rows, trials } = await consoleData();
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const now = Date.now();
  const leads = trials.map((t): TrialLead => {
    const row = t.tenant ? bySlug.get(t.slug) : undefined;
    const a = row ? { url: row.siteUrl, label: row.siteLabel } : siteAddress(t.slug, []);
    const state: TrialLead["state"] = !t.tenant ? "deleted" : t.tenant.status !== "active" ? "off"
      : !t.tenant.trialEndsAt ? "activated" : Date.parse(t.tenant.trialEndsAt) > now ? "running" : "ended";
    return {
      id: t.id, createdAt: t.createdAt, createdLabel: formatWhen(t.createdAt), name: t.name, subject: t.subject, phone: t.phone, english: langOf(t.locale ?? "") === "en",
      username: t.username, notes: t.notes, slug: t.slug, siteUrl: a.url, siteLabel: a.label, state, trialEndsAt: t.tenant?.trialEndsAt ?? null,
    };
  });
  return (
    <>
      <div className="a-head">
        <h1>طلبات التجربة</h1>
        <p className="a-sub">كل اللي عملوا موقع تجريبي من صفحة المنصة: بياناتهم، ملاحظاتهم، وحالة موقعهم. الطلبات بتفضل هنا حتى لو مسحت الموقع.</p>
        <div className="a-actions"><a className="btn-sm ghost" href="/admin/trials/export">تنزيل Excel (CSV)</a></div>
      </div>
      <TrialsTable leads={leads} now={now} />
    </>
  );
}
