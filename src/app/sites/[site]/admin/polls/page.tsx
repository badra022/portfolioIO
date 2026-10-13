import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { copyFor, getTenant } from "@/lib/server/repo";
import { adminEnv } from "@/lib/server/admin-env";
import { resultsFor } from "@/lib/server/polls";
import { pollStatus, pollTimes } from "@/lib/poll";
import { formatWhen } from "@/lib/admin/format";
import { CopyLink } from "@/components/admin/CopyLink";
import { resetVotesAction, updatePollAction } from "../actions";

export const metadata: Metadata = { title: "التصويتات" };

/** Anonymous votes: live counts per choice, the link to share, and open/close/restart. */
export default async function Polls({ params }: PageProps<"/sites/[site]/admin/polls">) {
  const site = decodeURIComponent((await params).site);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  if (!slug || !t) notFound();
  const base = baseForSite(site);
  const env = await adminEnv();
  const polls = copyFor(t, env).content.polls;
  const all = await Promise.all(polls.map(async (p) => ({ p, r: await resultsFor(slug, env, p), s: pollStatus(p), end: pollTimes(p).end })));

  return (
    <>
      <div className="a-head">
        <a className="a-back" href={`${base}/admin`}>→ كل الأقسام</a>
        <h1>التصويتات</h1>
        <p className="a-sub">
          كل تصويت ليه صفحة لوحده: انسخ الرابط وحطه في الستوري أو الجروب. الطلاب بيختاروا بس، من غير اسم ولا رقم، وكل جهاز بيصوّت مرة واحدة.
          العداد واحد للكل: بيبدأ من وقت البداية لحد ما المدة تخلص.
        </p>
        <div className="a-actions"><a className="btn-sm primary" href={`${base}/admin/edit/polls`}>+ تصويت جديد / تعديل</a></div>
      </div>
      {polls.length === 0 && <p className="an-empty">لسه مفيش تصويتات. اعمل واحد من «تصويت جديد».</p>}
      <ul className="qz-list">
        {all.map(({ p, r, s, end }) => {
          const label = s.open ? (p.state === "open" ? "مفتوح (يدوي)" : "مفتوح") : s.reason === "notYet" ? "لسه مبدأش" : s.reason === "over" ? "انتهى" : "مقفول";
          const top = Math.max(1, ...r.counts);
          return (
            <li key={p.path} className="a-panel qz-item">
              <div className="qz-head">
                <span className={`rq-badge ${s.open ? "new" : ""}`}>{label}</span>
                <b>{p.title}</b>
                <span className="a-sub">{r.total} صوت</span>
              </div>
              <CopyLink path={`${base}/${p.path}`} />
              <p className="a-sub">
                {p.state === "auto" && p.startsAt ? `بدأ ${formatWhen(new Date(pollTimes(p).start!).toISOString())}` : ""}
                {p.state === "auto" && end ? ` · ينتهي ${formatWhen(new Date(end).toISOString())}` : p.state === "auto" ? " · من غير نهاية" : ""}
                {p.showResults ? " · الطالب بيشوف النتيجة بعد ما يصوّت" : " · النتيجة ليك بس"}
              </p>
              <section className="an-bars pl-admin">
                <ul>
                  {p.choices.map((c, i) => (
                    <li key={i}>
                      <span className="an-lbl">{c.label}</span>
                      <span className="an-track">{r.counts[i] > 0 && <i style={{ inlineSize: `${(r.counts[i] / top) * 100}%` }} />}</span>
                      <span className="an-val">{r.counts[i]} {r.total ? <small className="a-sub">({Math.round((r.counts[i] / r.total) * 100)}%)</small> : null}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <div className="qz-actions">
                {(["open", "closed", "auto"] as const).filter((v) => v !== p.state).map((v) => (
                  <form key={v} action={updatePollAction.bind(null, site, p.path, v, env)}>
                    <button type="submit" className={`btn-sm ${v === "closed" ? "danger" : "ghost"}`}>{v === "open" ? "افتح الآن" : v === "closed" ? "اقفل الآن" : "حسب الوقت"}</button>
                  </form>
                ))}
                <form action={updatePollAction.bind(null, site, p.path, "restart", env)}>
                  <button type="submit" className="btn-sm ghost">ابدأ العداد من دلوقتي ({p.durationHours ? `${p.durationHours} ساعة` : "من غير نهاية"})</button>
                </form>
                <a className="btn-sm ghost" href={`${base}/admin/edit/polls`}>تعديل</a>
                <details className="a-confirm">
                  <summary className="f-link danger">تصفير الأصوات</summary>
                  <form action={resetVotesAction.bind(null, site, p.path, env)}>
                    <p className="a-sub">هتتمسح الأصوات ({r.total}) وتبدأ من صفر. الأجهزة اللي صوّتت مش هتقدر تصوّت تاني.</p>
                    <button type="submit" className="btn-sm danger">أيوه، صفّر</button>
                  </form>
                </details>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
