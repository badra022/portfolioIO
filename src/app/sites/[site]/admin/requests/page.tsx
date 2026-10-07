import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasDb } from "@/lib/env";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { getTenant } from "@/lib/server/repo";
import { listSubmissions, STATUSES, type StatusT } from "@/lib/server/submissions";
import { formatWhen } from "@/lib/admin/format";
import { PLACE } from "@/lib/admin/places";
import { deleteRequestAction, setRequestStatusAction } from "../actions";

export const metadata: Metadata = { title: "الطلبات" };

const STATUS_LABEL: Record<StatusT, string> = { new: "جديد", contacted: "تم التواصل", done: "منتهي" };
const PAGE = 50;

/** WhatsApp wants international digits: an Egyptian 01xxxxxxxxx becomes 201xxxxxxxxx. */
const waNumber = (v: string) => {
  const d = v.replace(/\D/g, "");
  return /^01\d{9}$/.test(d) ? `2${d}` : d;
};

export default async function Requests({ params, searchParams }: PageProps<"/sites/[site]/admin/requests">) {
  const site = decodeURIComponent((await params).site);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  if (!slug) notFound();
  const t = await getTenant(slug);
  if (!t) notFound();
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const status = (STATUSES as readonly string[]).includes(one(q.status)) ? (one(q.status) as StatusT) : undefined;
  const form = one(q.form) || undefined;
  const search = one(q.q).trim().slice(0, 60) || undefined;
  const page = Math.max(1, Number(one(q.page)) || 1);
  const { rows, total, counts } = await listSubmissions(slug, { form, status, q: search, limit: PAGE, offset: (page - 1) * PAGE });
  const forms = t.content.forms;
  const formOf = new Map(forms.map((f) => [f.id, f]));
  const base = baseForSite(site);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status, form, q: search, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "?";
  };

  return (
    <>
      <div className="a-head">
        <a className="a-back" href={`${base}/admin`}>→ كل الأقسام</a>
        <h1>الطلبات</h1>
        <p className="a-sub">اللي بعته الطلاب من الأزرار اللي بتفتح نموذج بدل واتساب. كلّم اللي تختاره، وغيّر حالته عشان تعرف وصلت لفين.</p>
      </div>
      {!hasDb() && <div className="a-alert">الطلبات محتاجة قاعدة بيانات متصلة (DATABASE_URL).</div>}
      {forms.length === 0 && (
        <div className="a-alert">لسه مفيش نماذج. أنشئ نموذج من <a href={`${base}/admin/edit/forms`}>نماذج جمع البيانات</a>، ثم اختاره في أي زر من خانة «عند الضغط على الزر».</div>
      )}

      <nav className="an-ranges" aria-label="الحالة">
        <a href={qs({ status: undefined, page: undefined })} aria-current={!status ? "page" : undefined}>الكل ({counts.new + counts.contacted + counts.done})</a>
        {STATUSES.map((s) => (
          <a key={s} href={qs({ status: s, page: undefined })} aria-current={status === s ? "page" : undefined}>{STATUS_LABEL[s]} ({counts[s]})</a>
        ))}
      </nav>
      <form className="rq-filters" method="get">
        {status && <input type="hidden" name="status" value={status} />}
        {forms.length > 1 && (
          <select name="form" defaultValue={form ?? ""}>
            <option value="">كل النماذج</option>
            {forms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
        )}
        <input name="q" defaultValue={search ?? ""} placeholder="بحث برقم أو اسم أو إجابة" />
        <button type="submit" className="btn-sm">بحث</button>
        <a className="btn-sm ghost" href={`${base}/admin/requests/export${qs({ page: undefined })}`}>تنزيل Excel (CSV)</a>
      </form>

      {rows.length === 0 ? (
        <p className="an-empty">لا توجد طلبات{status || form || search ? " بهذا البحث" : " بعد"}.</p>
      ) : (
        <ul className="rq-list">
          {rows.map((r) => {
            const f = formOf.get(r.formId);
            const labelOf = (id: string) => f?.fields.find((x) => x.id === id)?.label ?? id;
            const typeOf = (id: string) => f?.fields.find((x) => x.id === id)?.type;
            return (
              <li key={r.id} className={`rq rq-${r.status}`}>
                <div className="rq-top">
                  <span className={`rq-badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  <b>{f?.title ?? r.formId}</b>
                  <span className="a-sub">{formatWhen(r.createdAt)}</span>
                </div>
                <dl className="rq-data">
                  {Object.entries(r.fields).map(([k, v]) => (
                    <div key={k}>
                      <dt>{labelOf(k)}</dt>
                      <dd>
                        {typeOf(k) === "tel" ? (
                          <span className="rq-phone">
                            <a dir="ltr" href={`tel:${v}`}>{v}</a>
                            <a className="rq-wa" href={`https://wa.me/${waNumber(v)}`} target="_blank" rel="noopener noreferrer">واتساب</a>
                          </span>
                        ) : v}
                      </dd>
                    </div>
                  ))}
                  {Object.entries(r.context).map(([k, v]) => (
                    <div key={`c-${k}`} className="rq-ctx"><dt>{k}</dt><dd>{v}</dd></div>
                  ))}
                </dl>
                <div className="rq-foot">
                  <span className="a-sub">{r.source}{r.place ? ` · ${PLACE[r.place] ?? r.place}` : ""}</span>
                  <span className="rq-actions">
                    {STATUSES.filter((s) => s !== r.status).map((s) => (
                      <form key={s} action={setRequestStatusAction.bind(null, site, [r.id], s)}>
                        <button className="btn-sm ghost" type="submit">{STATUS_LABEL[s]}</button>
                      </form>
                    ))}
                    <details className="a-confirm">
                      <summary className="f-link danger">حذف</summary>
                      <form action={deleteRequestAction.bind(null, site, [r.id])}>
                        <button type="submit" className="btn-sm danger">تأكيد الحذف</button>
                      </form>
                    </details>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {total > PAGE && (
        <nav className="rq-pages">
          {page > 1 && <a className="btn-sm ghost" href={qs({ page: String(page - 1) })}>السابق</a>}
          <span className="a-sub">صفحة {page} من {Math.ceil(total / PAGE)}</span>
          {page * PAGE < total && <a className="btn-sm ghost" href={qs({ page: String(page + 1) })}>التالي</a>}
        </nav>
      )}
    </>
  );
}
