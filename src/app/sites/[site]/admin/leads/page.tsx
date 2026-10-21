import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireSuper } from "@/lib/server/auth";
import { CONTACT_ROLES, CONTACT_STATUSES, listContacts, type ContactStatus } from "@/lib/server/contact";
import { fromNow } from "@/lib/admin/tenant-actions";
import { deleteLeadAction, setLeadStatusAction } from "./actions";

export const metadata: Metadata = { title: "طلبات التواصل" };

/** Super admin, platform host: everyone who wrote through the «كلمنا» form on the home page. */
export default async function Leads({ params }: PageProps<"/sites/[site]/admin/leads">) {
  const site = decodeURIComponent((await params).site);
  if (site !== "_platform") notFound();
  await requireSuper(site);
  await connection();
  const leads = await listContacts();
  const now = Date.now();
  return (
    <>
      <div className="a-head">
        <h1>طلبات التواصل</h1>
        <p className="a-sub">اللي كتبولك من فورم «كلمنا» في الصفحة الرئيسية: مدرسين وسناتر ووكالات عايزين يعرفوا أكتر. اضغط على الرقم يفتح واتساب.</p>
      </div>
      {leads.length === 0 ? <p className="a-sub">لسه محدش كتب.</p> : (
        <div className="sa-table-wrap">
          <table className="a-table sa-table">
            <thead><tr><th>امتى</th><th>الاسم</th><th>واتساب</th><th>الرسالة</th><th>الحالة</th><th aria-label="حذف" /></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td><b>{fromNow(l.createdAt, now)}</b></td>
                  <td><span className="sa-name">{l.name}</span><span className="sa-meta">{CONTACT_ROLES[l.role]}{l.subject ? ` · ${l.subject}` : ""}</span></td>
                  <td><a dir="ltr" className="sa-url" href={`https://wa.me/${l.phone}`} target="_blank" rel="noopener">+{l.phone}</a></td>
                  <td style={{ maxWidth: 360, whiteSpace: "pre-wrap" }}>{l.message || "—"}</td>
                  <td>
                    <div className="sa-chips">
                      {(Object.keys(CONTACT_STATUSES) as ContactStatus[]).map((s) => (
                        <form key={s} action={setLeadStatusAction.bind(null, l.id, s)}>
                          <button type="submit" className={`btn-sm${l.status === s ? " primary" : " ghost"}`} aria-pressed={l.status === s}>{CONTACT_STATUSES[s]}</button>
                        </form>
                      ))}
                    </div>
                  </td>
                  <td><form action={deleteLeadAction.bind(null, l.id)}><button type="submit" className="btn-sm ghost danger">حذف</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
