import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { getResultSet } from "@/lib/server/exam-results";
import { ResultsEditor } from "@/components/admin/ResultsEditor";

export const metadata: Metadata = { title: "نتيجة امتحان" };

export default async function ResultSetPage({ params }: PageProps<"/sites/[site]/admin/results/[id]">) {
  const { site: raw, id } = await params;
  const site = decodeURIComponent(raw);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  const set = slug ? await getResultSet(slug, Number(id)) : null;
  if (!set) notFound();
  const base = baseForSite(site);
  return (
    <>
      <div className="a-head">
        <a className="a-back" href={`${base}/admin/results`}>→ كل النتايج</a>
        <h1>{set.title}</h1>
        <p className="a-sub">{set.rows.length} طالب · {set.lookups} بحث من الموقع ({set.found} لقوا نتيجتهم)</p>
      </div>
      <ResultsEditor site={site} initial={set} />
    </>
  );
}
