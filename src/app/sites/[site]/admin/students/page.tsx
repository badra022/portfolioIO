import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { copyFor, getTenant } from "@/lib/server/repo";
import { adminEnv } from "@/lib/server/admin-env";
import { listStudents, syncStudents } from "@/lib/server/students";
import { formatWhen } from "@/lib/admin/format";
import { nameKey, phoneKey } from "@/lib/exam-results";
import { PlanBlocked } from "@/components/admin/PlanBlocked";
import { ActionForm } from "@/components/admin/ConsoleForms";
import { createStudentAction } from "../actions";

export const metadata: Metadata = { title: "الطلاب" };

const SORTS = { recent: "آخر نشاط", name: "الاسم", quiz: "متوسط الاختبارات", exam: "متوسط الامتحانات", active: "الأكتر تفاعل" } as const;
type Sort = keyof typeof SORTS;
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

/** Every student who used the site, one per phone number (lib/server/students.ts). */
export default async function Students({ params, searchParams }: PageProps<"/sites/[site]/admin/students">) {
  const site = decodeURIComponent((await params).site);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  if (!slug || !t) notFound();
  const base = baseForSite(site);
  if (!t.permissions.students) return <PlanBlocked feature="students" back={`${base}/admin`} />;
  const env = await adminEnv();
  const content = copyFor(t, env).content;
  await syncStudents(slug, env, content);
  const all = await listStudents(slug, env, content);

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const sort: Sort = typeof sp.sort === "string" && sp.sort in SORTS ? (sp.sort as Sort) : "recent";
  const nq = nameKey(q), pq = phoneKey(q);
  let list = q ? all.filter((s) => (nq && (nameKey(s.name).includes(nq) || Object.values(s.traits).some((t) => nameKey(t.value).includes(nq)))) || (pq.length >= 3 && phoneKey(s.phone).includes(pq))) : all;
  const by = (f: (s: (typeof all)[number]) => number | null) => (a: (typeof all)[number], b: (typeof all)[number]) => (f(b) ?? -1) - (f(a) ?? -1);
  if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name, "ar"));
  if (sort === "quiz") list = [...list].sort(by((s) => s.stats.quizAvg));
  if (sort === "exam") list = [...list].sort(by((s) => s.stats.examAvg));
  if (sort === "active") list = [...list].sort(by((s) => s.stats.requests + s.stats.quizzes + s.stats.exams));
  const link = (o: { sort?: string }) => `?${new URLSearchParams({ ...(q ? { q } : {}), sort: o.sort ?? sort })}`;
  const shown = list.slice(0, 500);

  return (
    <>
      <div className="a-head">
        <h1>الطلاب <span className="a-sub">({all.length})</span></h1>
        <p className="a-sub">
          ملف لكل طالب برقم موبايله، بيتملى لوحده من النماذج والاختبارات ونتايج الامتحانات: بياناته، طلباته، درجاته ومنحنى مستواه.
          التصويتات مش داخلة لأنها من غير اسم ولا رقم.
        </p>
        <div className="a-actions">
          <a className="btn-sm primary" href={`${base}/admin/students/export`}>تنزيل Excel (CSV)</a>
        </div>
      </div>

      <details className="a-panel">
        <summary><b>+ إضافة طالب بإيدك</b></summary>
        <ActionForm action={createStudentAction.bind(null, site)} submit="إضافة" className="a-form inline">
          <input name="name" placeholder="اسم الطالب" required />
          <input name="phone" dir="ltr" inputMode="tel" placeholder="01xxxxxxxxx" required />
        </ActionForm>
      </details>

      <section className="a-panel">
        <form className="rq-filters" method="get">
          <input type="search" name="q" defaultValue={q} placeholder="دوّر باسم أو رقم أو أي بيانات (المدرسة، الصف…)" />
          <input type="hidden" name="sort" value={sort} />
          <button type="submit" className="btn-sm ghost">بحث</button>
        </form>
        <nav className="an-ranges">
          {(Object.keys(SORTS) as Sort[]).map((k) => <a key={k} href={link({ sort: k })} aria-current={sort === k ? "page" : undefined}>{SORTS[k]}</a>)}
        </nav>
        {list.length === 0 ? <p className="an-empty">{q ? "مفيش طالب بالبحث ده." : "لسه مفيش طلاب: أول ما حد يبعت نموذج أو يحل اختبار برقم موبايله هيظهر هنا."}</p> : (
          <div className="ps-scroll">
            <table className="a-table st-table">
              <thead><tr><th>الطالب</th><th>الموبايل</th><th>بيانات</th><th>طلبات</th><th>اختبارات</th><th>متوسط الاختبارات</th><th>امتحانات</th><th>متوسط الامتحانات</th><th>آخر نشاط</th></tr></thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id}>
                    <td><a href={`${base}/admin/students/${s.id}`}><b>{s.name || "من غير اسم"}</b></a></td>
                    <td dir="ltr">{s.phone}</td>
                    <td className="st-tags">{Object.values(s.traits).slice(0, 3).map((t, i) => <span key={i} className="rq-badge" title={t.label}>{t.value}</span>)}</td>
                    <td>{s.stats.requests}</td>
                    <td>{s.stats.finished}</td>
                    <td><b>{pct(s.stats.quizAvg)}</b></td>
                    <td>{s.stats.exams}</td>
                    <td><b>{pct(s.stats.examAvg)}</b></td>
                    <td className="a-sub">{formatWhen(s.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.length > shown.length && <p className="a-sub">ظاهر أول {shown.length} من {list.length}. دوّر أو نزّل الملف للكل.</p>}
      </section>
    </>
  );
}
