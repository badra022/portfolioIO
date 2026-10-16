import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasDb } from "@/lib/env";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { copyFor, getTenant } from "@/lib/server/repo";
import { adminEnv } from "@/lib/server/admin-env";
import { COMPLAINT_STATUSES, listComplaints, type ComplaintStatus } from "@/lib/server/complaints";
import { deleteComplaintAction, setComplaintStatusAction } from "../actions";

export const metadata: Metadata = { title: "الشكاوى والاقتراحات" };

const STATUS_LABEL: Record<ComplaintStatus, string> = { new: "جديدة", read: "اتقرت", done: "اتحلّت" };
const PAGE = 50;
const NO_TOPIC = "من غير موضوع";

/** "2026-10-16" → «الخميس 16 أكتوبر»: the day only, there is no time to show. */
const dayLabel = (day: string) =>
  new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

export default async function ComplaintsPage({ params, searchParams }: PageProps<"/sites/[site]/admin/complaints">) {
  const site = decodeURIComponent((await params).site);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  if (!slug) notFound();
  const t = await getTenant(slug);
  if (!t) notFound();
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const status = (COMPLAINT_STATUSES as readonly string[]).includes(one(q.status)) ? (one(q.status) as ComplaintStatus) : undefined;
  const topic = one(q.topic).slice(0, 80) || undefined;
  const page = Math.max(1, Number(one(q.page)) || 1);
  const env = await adminEnv();
  const content = copyFor(t, env).content;
  const on = content.sections.includes("complaints");
  const { rows, total, counts, topics, month } = await listComplaints(slug, { env, status, topic, limit: PAGE, offset: (page - 1) * PAGE });
  const all = counts.new + counts.read + counts.done;
  const base = baseForSite(site);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, topic, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "?";
  };
  const newIds = rows.filter((r) => r.status === "new").map((r) => r.id);
  const top = Math.max(1, ...topics.map((x) => x.n));

  return (
    <>
      <div className="a-head">
        <h1>الشكاوى والاقتراحات</h1>
        <p className="a-sub">اللي كتبه الطلاب في «صندوق الشكاوى» على موقعك. من غير اسم ولا رقم ولا ساعة، اليوم بس، عشان يقدروا يقولوا رأيهم براحتهم.</p>
      </div>
      {!hasDb() && <div className="a-alert">الشكاوى محتاجة قاعدة بيانات متصلة (DATABASE_URL).</div>}
      <p className={`cp-state ${on ? "on" : "off"}`}>
        <span className={`st-chip ${on ? "on" : "off"}`}>{on ? "ظاهر في الموقع" : "مقفول"}</span>
        {on ? "الطلاب يقدروا يبعتوا دلوقتي. " : "القسم مش ظاهر في موقعك، فمحدش يقدر يبعت. "}
        <a href={`${base}/admin/edit/layout`}>{on ? "اقفله" : "شغّله"} من «ترتيب الأقسام»</a>
        {" · "}
        <a href={`${base}/admin/edit/complaints`}>عدّل الكلام والمواضيع</a>
      </p>

      <section className="an-tiles">
        <div className="an-tile strong"><span>جديدة</span><b>{counts.new}</b></div>
        <div className="an-tile"><span>الشهر ده</span><b>{month}</b></div>
        <div className="an-tile"><span>من البداية</span><b>{all}</b></div>
      </section>

      {topics.length > 0 && (topics.length > 1 || topics[0].topic !== null) && (
        <section className="a-panel an-bars">
          <h2>عن إيه بيشتكوا</h2>
          <ul>
            {topics.map((x) => (
              <li key={x.topic ?? ""}>
                <a className="an-lbl" href={qs({ topic: x.topic ?? undefined, page: undefined })}>{x.topic ?? NO_TOPIC}</a>
                <span className="an-track"><i style={{ inlineSize: `${(x.n / top) * 100}%` }} /></span>
                <span className="an-val">{x.n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="an-ranges" aria-label="الحالة">
        <a href={qs({ status: undefined, page: undefined })} aria-current={!status ? "page" : undefined}>الكل ({all})</a>
        {COMPLAINT_STATUSES.map((s) => (
          <a key={s} href={qs({ status: s, page: undefined })} aria-current={status === s ? "page" : undefined}>{STATUS_LABEL[s]} ({counts[s]})</a>
        ))}
        {topic && <a href={qs({ topic: undefined, page: undefined })}>✕ {topic}</a>}
      </nav>

      {newIds.length > 1 && (
        <form className="cp-bulk" action={setComplaintStatusAction.bind(null, site, newIds, "read")}>
          <button type="submit" className="btn-sm ghost">علّم الكل «اتقرت» ({newIds.length})</button>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="an-empty">{status || topic ? "مفيش رسائل بالاختيار ده." : on ? "لسه محدش بعت. أول ما حد يكتب هتلاقيها هنا." : "لسه مفيش رسائل. شغّل القسم عشان الطلاب يقدروا يكتبوا."}</p>
      ) : (
        <ul className="rq-list">
          {rows.map((r) => (
            <li key={r.id} className={`rq cp-item ${r.status === "new" ? "rq-new" : ""} ${r.status === "done" ? "rq-done" : ""}`}>
              <div className="rq-top">
                <span className={`rq-badge ${r.status === "new" ? "new" : r.status === "read" ? "contacted" : "gr-ok"}`}>{STATUS_LABEL[r.status]}</span>
                {r.topic && <span className="hm-chip">{r.topic}</span>}
                <span className="a-sub">{dayLabel(r.day)}</span>
              </div>
              <p className="cp-msg">{r.message}</p>
              <div className="rq-foot">
                <span className="a-sub">🔒 من غير اسم</span>
                <span className="rq-actions">
                  {COMPLAINT_STATUSES.filter((s) => s !== r.status).map((s) => (
                    <form key={s} action={setComplaintStatusAction.bind(null, site, [r.id], s)}>
                      <button className="btn-sm ghost" type="submit">{STATUS_LABEL[s]}</button>
                    </form>
                  ))}
                  <details className="a-confirm">
                    <summary className="f-link danger">حذف</summary>
                    <form action={deleteComplaintAction.bind(null, site, [r.id])}>
                      <button type="submit" className="btn-sm danger">تأكيد الحذف</button>
                    </form>
                  </details>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {total > PAGE && (
        <nav className="rq-pages" aria-label="الصفحات">
          {page > 1 && <a className="btn-sm ghost" href={qs({ page: String(page - 1) })}>السابق</a>}
          <span className="a-sub">صفحة {page} من {Math.ceil(total / PAGE)}</span>
          {page * PAGE < total && <a className="btn-sm ghost" href={qs({ page: String(page + 1) })}>التالي</a>}
        </nav>
      )}
    </>
  );
}
