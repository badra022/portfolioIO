import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { copyFor, getTenant } from "@/lib/server/repo";
import { adminEnv } from "@/lib/server/admin-env";
import { getStudent, syncStudents } from "@/lib/server/students";
import { formatWhen } from "@/lib/admin/format";
import { PlanBlocked } from "@/components/admin/PlanBlocked";
import { GradeChart } from "@/components/admin/GradeChart";
import { StudentEditor } from "@/components/admin/StudentEditor";
import { deleteStudentAction } from "../../actions";

export const metadata: Metadata = { title: "ملف طالب" };

const STATUS: Record<string, string> = { submitted: "سلّم", timed_out: "انتهى الوقت", in_progress: "بيحل دلوقتي" };
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const waNumber = (v: string) => { const d = v.replace(/\D/g, ""); return /^01\d{9}$/.test(d) ? `2${d}` : d; };

export default async function StudentPage({ params }: PageProps<"/sites/[site]/admin/students/[id]">) {
  const { site: raw, id } = await params;
  const site = decodeURIComponent(raw);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  if (!slug || !t) notFound();
  const base = baseForSite(site);
  if (!t.permissions.students) return <PlanBlocked feature="students" back={`${base}/admin`} />;
  const env = await adminEnv();
  const content = copyFor(t, env).content;
  await syncStudents(slug, env, content);
  const s = await getStudent(slug, env, content, Number(id));
  if (!s) notFound();
  const st = s.stats;
  const last = st.points.slice(-2);
  const trend = last.length === 2 ? last[1].percent - last[0].percent : null;

  return (
    <>
      <div className="a-head">
        <a className="a-back" href={`${base}/admin/students`}>→ الطلاب</a>
        <h1>{s.name || "من غير اسم"}</h1>
        <p className="a-sub">
          <span className="rq-phone">
            <a dir="ltr" href={`tel:${s.phone}`}>{s.phone}</a>
            <a className="rq-wa" href={`https://wa.me/${waNumber(s.phone)}`} target="_blank" rel="noopener noreferrer">واتساب</a>
          </span>
          {" · "}أول ظهور {formatWhen(s.firstSeenAt)} · آخر نشاط {formatWhen(s.lastSeenAt)}
        </p>
      </div>

      <div className="an-tiles">
        <div className="an-tile"><span>طلبات (نماذج)</span><b>{st.requests}</b></div>
        <div className="an-tile"><span>اختبارات حلها</span><b>{st.finished}</b><small>{st.quizzes > st.finished ? `${st.quizzes - st.finished} لسه مسلّمهاش` : " "}</small></div>
        <div className="an-tile strong"><span>متوسط الاختبارات</span><b dir="ltr">{pct(st.quizAvg)}</b></div>
        <div className="an-tile"><span>امتحانات (نتايج)</span><b>{st.exams}</b></div>
        <div className="an-tile strong"><span>متوسط الامتحانات</span><b dir="ltr">{pct(st.examAvg)}</b></div>
        {trend !== null && (
          <div className="an-tile"><span>آخر تغيير</span><b dir="ltr" className={trend < 0 ? "st-down" : "st-up"}>{trend > 0 ? "+" : ""}{trend}%</b><small>بين آخر درجتين</small></div>
        )}
      </div>

      <section className="a-panel">
        <h2>المستوى مع الوقت</h2>
        <p className="a-sub">كل نقطة اختبار أونلاين (دايرة) أو امتحان (مربع)، بالنسبة المئوية. الدرجة المعتمدة من المدرس لو موجودة، وإلا التصحيح التلقائي.</p>
        <GradeChart points={st.points} />
        {st.points.length > 0 && (
          <details className="an-table">
            <summary>الدرجات كجدول</summary>
            <table className="a-table">
              <thead><tr><th>التاريخ</th><th>الاختبار / الامتحان</th><th>الدرجة</th><th>%</th></tr></thead>
              <tbody>{[...st.points].reverse().map((p, i) => <tr key={i}><td>{formatWhen(p.at)}</td><td>{p.title}</td><td dir="ltr">{p.score}</td><td>{p.percent}%</td></tr>)}</tbody>
            </table>
          </details>
        )}
      </section>

      <StudentEditor site={site} id={s.id} name={s.name} traits={s.traits} notes={s.notes} />

      <section className="a-panel">
        <h2>الاختبارات ({s.attempts.length})</h2>
        {s.attempts.length === 0 ? <p className="an-empty">محلّش اختبارات أونلاين.</p> : (
          <ul className="rq-list">
            {s.attempts.map((a) => (
              <li key={a.id} className="rq">
                <div className="rq-top">
                  <b>{a.title}</b>
                  <span className="rq-badge">{STATUS[a.status] ?? a.status}</span>
                  {a.grade && <b className="qz-score" dir="ltr">{a.grade}</b>}
                  {a.approved && <span className="rq-badge gr-ok">✓ معتمدة</span>}
                  <span className="a-sub">{formatWhen(a.at)}</span>
                  <a className="f-link" href={`${base}/admin/quizzes/${a.quizPath}`}>التصحيح ↗</a>
                </div>
                {a.note && <p className="a-sub">تعليقك: {a.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="a-panel">
        <h2>الطلبات ({s.requests.length})</h2>
        {s.requests.length === 0 ? <p className="an-empty">مبعتش نماذج.</p> : (
          <ul className="rq-list">
            {s.requests.map((r) => (
              <li key={r.id} className="rq">
                <div className="rq-top"><b>{r.formTitle}</b><span className="a-sub">{formatWhen(r.createdAt)}</span></div>
                <dl className="rq-data">{r.fields.map((f, i) => <div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="a-panel a-confirm">
        <summary className="f-link danger">حذف ملف الطالب</summary>
        <form action={deleteStudentAction.bind(null, site, s.id)}>
          <p className="a-sub">الملف وبياناتك عليه هيتمسحوا. طلباته واختباراته بتفضل في صفحاتها، ولو رجع استخدم الموقع بنفس الرقم هيتعمله ملف جديد.</p>
          <button type="submit" className="btn-sm danger">أيوه، احذف</button>
        </form>
      </details>
    </>
  );
}
