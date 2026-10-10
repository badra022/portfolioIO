import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { getTenant } from "@/lib/server/repo";
import { listResultSets } from "@/lib/server/exam-results";
import { formatWhen } from "@/lib/admin/format";
import { NewResultSet } from "@/components/admin/ResultsEditor";
import { createResultSetAction } from "../actions";
import { adminEnv } from "@/lib/server/admin-env";

export const metadata: Metadata = { title: "نتايج الامتحانات" };

export default async function Results({ params }: PageProps<"/sites/[site]/admin/results">) {
  const site = decodeURIComponent((await params).site);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  if (!slug || !t) notFound();
  const base = baseForSite(site);
  const [sets, env] = await Promise.all([listResultSets(slug), adminEnv()]);
  // Exams on the page (including finished ones still in the list), newest first, to copy title and date from.
  const exams = [...(t.content.exams?.items ?? [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => ({ id: e.id, title: e.title, date: e.date.slice(0, 10) }));

  return (
    <>
      <div className="a-head">
        <a className="a-back" href={`${base}/admin`}>→ كل الأقسام</a>
        <h1>نتايج الامتحانات</h1>
        <p className="a-sub">
          حط درجات كل امتحان (من Excel أو بالنسخ واللصق)، ولما تنشرها الطالب يقدر يعرف درجته من الموقع في قسم الامتحانات باسمه ورقم موبايله.
          الطالب بيلاقي نتيجته لو رقم الموبايل (من غير كود الدولة) والاسم الأول نفس اللي في الشيت.
        </p>
      </div>

      <details className="a-panel" open={sets.length === 0}>
        <summary><b>+ نتيجة امتحان جديد</b></summary>
        <NewResultSet action={createResultSetAction.bind(null, site)} exams={exams} />
      </details>

      {sets.length === 0 ? <p className="an-empty">لسه مفيش نتايج.</p> : (
        <ul className="qz-list" style={{ marginTop: 16 }}>
          {sets.map((s) => (
            <li key={s.id} className="a-panel qz-item">
              <div className="qz-head">
                <span className={`rq-badge ${s.published ? "new" : ""}`}>{s.published ? "على الموقع" : "مش على الموقع"}</span>
                {s.preview.published && <span className="rq-badge contacted">في المعاينة</span>}
                <b>{s.title}</b>
                <span className="a-sub">{s.date}</span>
              </div>
              <p className="a-sub">
                {s.count} طالب{s.total ? ` · الدرجة من ${s.total}` : ""} · {env === "preview" ? `${s.preview.lookups} بحث من المعاينة (${s.preview.found} لقوا نتيجتهم)` : `${s.lookups} بحث من الموقع (${s.found} لقوا نتيجتهم)`} · آخر تعديل {formatWhen(s.updatedAt)}{s.updatedBy ? ` بواسطة ${s.updatedBy}` : ""}
              </p>
              <div className="qz-actions"><a className="btn-sm primary" href={`${base}/admin/results/${s.id}`}>فتح وتعديل</a></div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
