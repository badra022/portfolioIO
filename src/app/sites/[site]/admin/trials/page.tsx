import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireSuper } from "@/lib/server/auth";
import { consoleData, trialLeads } from "@/lib/server/console";
import { TrialsTable } from "@/components/admin/TrialsTable";

export const metadata: Metadata = { title: "طلبات التجربة" };

/** Super admin, platform host: every request from the home page's trial form, with its site's state. */
export default async function Trials({ params }: PageProps<"/sites/[site]/admin/trials">) {
  const site = decodeURIComponent((await params).site);
  if (site !== "_platform") notFound();
  await requireSuper(site);
  await connection();
  const { rows, trials, partners } = await consoleData();
  const now = Date.now();
  const leads = trialLeads(rows, trials, partners, now);
  return (
    <>
      <div className="a-head">
        <h1>طلبات التجربة</h1>
        <p className="a-sub">كل اللي عملوا موقع تجريبي من صفحة المنصة أو من صفحات الشركاء: بياناتهم، ملاحظاتهم، وحالة موقعهم. الطلبات بتفضل هنا حتى لو مسحت الموقع.</p>
        <div className="a-actions"><a className="btn-sm ghost" href="/admin/trials/export">تنزيل Excel (CSV)</a></div>
      </div>
      <TrialsTable leads={leads} now={now} />
    </>
  );
}
