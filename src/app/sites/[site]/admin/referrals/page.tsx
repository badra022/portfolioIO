import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasDb } from "@/lib/env";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { copyFor, getTenant } from "@/lib/server/repo";
import { adminEnv } from "@/lib/server/admin-env";
import { RANGES, rangeOf, type RangeT } from "@/lib/server/analytics";
import { referralReport, type TargetStats } from "@/lib/server/referrals";
import { refLink, REF_DAYS } from "@/lib/referral";
import { PlanBlocked } from "@/components/admin/PlanBlocked";
import { CopyLink } from "@/components/admin/CopyLink";

export const metadata: Metadata = { title: "روابط الشركاء" };

const RANGE_LABEL: Record<RangeT, string> = { today: "النهاردة", month: "الشهر ده", lastMonth: "الشهر اللي فات", all: "من البداية" };
const n = (v: number) => v.toLocaleString("en-US");

/**
 * Referral partners (affiliate marketing): each partner's links to the site, a
 * quiz, a vote or a form, and what came through them — visits, then requests,
 * quiz attempts and votes credited to the partner for 30 days.
 */
export default async function Referrals({ params, searchParams }: PageProps<"/sites/[site]/admin/referrals">) {
  const site = decodeURIComponent((await params).site);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  if (!slug || !t) notFound();
  const base = baseForSite(site);
  if (!t.permissions.promo) return <PlanBlocked feature="promo" back={`${base}/admin`} />;
  const env = await adminEnv();
  const c = copyFor(t, env).content;
  const q = (await searchParams).range;
  const range: RangeT = RANGES.includes(q as RangeT) ? (q as RangeT) : "month";
  const { from, to } = rangeOf(range);
  const report = hasDb() && t.id ? await referralReport(t.id, env, c, from, to) : null;

  // Everything a partner can share: the site, each quiz, each vote, each form (opens on the home page).
  const targets: { key: string; label: string; kind: string; page: string; form?: string }[] = [
    { key: "home", label: "الصفحة الرئيسية", kind: "الموقع", page: "" },
    ...c.quizzes.map((x) => ({ key: `quiz:${x.path}`, label: x.title, kind: "اختبار", page: x.path })),
    ...c.polls.map((x) => ({ key: `poll:${x.path}`, label: x.title, kind: "تصويت", page: x.path })),
    ...c.forms.map((x) => ({ key: `form:${x.id}`, label: x.title, kind: "نموذج", page: "", form: x.id })),
  ];
  const empty: TargetStats = { views: 0, visitors: 0, actions: 0 };

  return (
    <>
      <div className="a-head">
        <h1>روابط الشركاء</h1>
        <p className="a-sub">
          لكل شريك (إنفلونسر، صفحة، سنتر، جروب) روابط خاصة بيه للموقع وللاختبارات والتصويتات والنماذج. أي حد يفتح رابط الشريك بيتحسب له،
          وأي طلب أو اختبار أو تصويت يعمله نفس الطالب خلال {REF_DAYS} يوم بيتسجل باسم الشريك، فتعرف مين جابلك طلاب وتحاسبه.
        </p>
        <div className="a-actions"><a className="btn-sm primary" href={`${base}/admin/edit/referrals`}>+ شريك جديد / تعديل</a></div>
        <nav className="an-ranges" aria-label="الفترة">
          {RANGES.map((k) => <a key={k} href={`?range=${k}`} aria-current={k === range ? "page" : undefined}>{RANGE_LABEL[k]}</a>)}
        </nav>
      </div>

      {c.referrals.length === 0 && <p className="an-empty">لسه مفيش شركاء. اضغط «شريك جديد»، اكتب اسمه وكود قصير بالإنجليزي (زي ahmed)، وهتلاقي روابطه هنا جاهزة للنسخ.</p>}
      {!report && c.referrals.length > 0 && <div className="a-alert">الأرقام محتاجة قاعدة بيانات متصلة (DATABASE_URL). الروابط شغالة.</div>}

      {report && c.referrals.length > 0 && (
        <section className="a-panel">
          <h2>الملخص</h2>
          <div className="a-table-wrap">
            <table className="a-table rf-table">
              <thead><tr><th>الشريك</th><th>زيارات</th><th>زوار</th><th>طلبات</th><th>اختبارات (سلّموا)</th><th>تصويتات</th><th>الإجمالي</th></tr></thead>
              <tbody>
                {[...c.referrals].map((r) => ({ r, p: report.get(r.code)! }))
                  .sort((a, b) => (b.p.requests + b.p.quizzes + b.p.votes) - (a.p.requests + a.p.quizzes + a.p.votes) || b.p.views - a.p.views)
                  .map(({ r, p }) => (
                    <tr key={r.code}>
                      <td><a href={`#ref-${r.code}`}><b>{r.name}</b></a><br /><code dir="ltr">{r.code}</code></td>
                      <td className="num">{n(p.views)}</td>
                      <td className="num">{n(p.visitors)}</td>
                      <td className="num">{n(p.requests)}</td>
                      <td className="num">{n(p.quizzes)} <span className="a-sub">({n(p.quizzesDone)})</span></td>
                      <td className="num">{n(p.votes)}</td>
                      <td className="num"><b>{n(p.requests + p.quizzes + p.votes)}</b></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {c.referrals.map((r) => {
        const p = report?.get(r.code);
        return (
          <section className="a-panel rf-partner" id={`ref-${r.code}`} key={r.code}>
            <div className="qz-head">
              <b>{r.name}</b>
              <code dir="ltr">?ref={r.code}</code>
              {p && <span className="a-sub">{n(p.views)} زيارة · {n(p.requests + p.quizzes + p.votes)} عملية</span>}
            </div>
            {r.note && <p className="a-sub">📝 {r.note}</p>}
            <ul className="rf-links">
              {targets.map((x) => {
                const s = p?.by.get(x.key) ?? empty;
                // Forms open on the home page: its visits are the home page's.
                const visits = x.form ? null : s;
                return (
                  <li key={x.key}>
                    <div className="rf-what"><span className="rq-badge">{x.kind}</span><b>{x.label}</b></div>
                    <CopyLink path={refLink("", base, r.code, x.page, x.form)} />
                    {p && (
                      <span className="rf-nums a-sub">
                        {visits && <>{n(visits.views)} زيارة · {n(visits.visitors)} زائر</>}
                        {x.key !== "home" && <>{visits ? " · " : ""}{x.kind === "اختبار" ? `${n(s.actions)} بدأ · ${n(s.done ?? 0)} سلّم` : x.kind === "تصويت" ? `${n(s.actions)} صوت` : `${n(s.actions)} طلب`}</>}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <p className="a-sub an-foot">
        «زيارات» = كل مرة حد فتح رابط الشريك. «زوار» = أجهزة مختلفة. الطلبات والاختبارات والتصويتات بتتحسب للشريك لو الطالب جه من رابطه في آخر {REF_DAYS} يوم
        (لو فتح روابط أكتر من شريك، بتتحسب لآخر واحد). زياراتك انت من المتصفح اللي فاتح لوحة التحكم مش بتتحسب، بس الطلبات بتتسجل.
      </p>
    </>
  );
}
