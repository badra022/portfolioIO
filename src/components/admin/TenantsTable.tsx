"use client";

import { useMemo, useState, useTransition } from "react";
import { tenantsAction } from "@/app/sites/[site]/admin/actions";
import { STATE_LABEL, TENANT_ACTION_LABEL, fromNow, type TenantActionT, type TenantState } from "@/lib/admin/tenant-actions";

export type TenantRow = {
  slug: string;
  name: string;
  state: TenantState;
  trialEndsAt: string | null;
  /** Where students open the site. */
  siteUrl: string;
  siteLabel: string;
  users: number;
  createdAt: string | null;
  updatedAt: string | null;
  english: boolean;
  /** Visitors and contacts this month. */
  visitors: number;
  contacts: number;
  /** Made from the public trial form. */
  fromTrial: boolean;
  /** The partner (agency) the site belongs to. */
  partner: { slug: string; name: string } | null;
};

const FILTERS: { id: "all" | TenantState; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "live", label: "شغالين" },
  { id: "trial", label: "تجارب شغالة" },
  { id: "trialOver", label: "تجارب انتهت" },
  { id: "off", label: "متوقفين" },
];

/** Which bulk actions make sense for the selection (shown as buttons above the table). */
const BULK: TenantActionT[] = ["enable", "disable", "extend", "end", "activate", "delete"];

/**
 * Every teacher in one table: filter by state, search, select some (or all shown)
 * and apply one action to all of them. A row opens the teacher's page; the
 * buttons on the row act on that teacher alone. Deleting always asks first.
 */
/** now: the server's time, so the «من ساعتين» texts match between server and browser. */
export function TenantsTable({ rows, now }: { rows: TenantRow[]; now: number }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [q, setQ] = useState("");
  // "" = every source, "-" = the platform's own (no partner), else a partner's slug.
  const [source, setSource] = useState("");
  const partners = useMemo(() => [...new Map(rows.filter((r) => r.partner).map((r) => [r.partner!.slug, r.partner!.name]))], [rows]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ action: TenantActionT; slugs: string[] } | null>(null);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.state] = (c[r.state] ?? 0) + 1;
    return c;
  }, [rows]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => (filter === "all" || r.state === filter)
      && (!source || (source === "-" ? !r.partner : r.partner?.slug === source))
      && (!term || r.name.toLowerCase().includes(term) || r.slug.includes(term) || r.siteLabel.toLowerCase().includes(term)));
  }, [rows, filter, q, source]);
  const allShown = shown.length > 0 && shown.every((r) => picked.has(r.slug));
  const selected = rows.filter((r) => picked.has(r.slug));

  const toggle = (slug: string) => setPicked((p) => { const n = new Set(p); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });
  const toggleAll = () => setPicked((p) => {
    const n = new Set(p);
    if (allShown) shown.forEach((r) => n.delete(r.slug)); else shown.forEach((r) => n.add(r.slug));
    return n;
  });

  function run(action: TenantActionT, slugs: string[]) {
    if (!slugs.length) return;
    if (action === "delete" || action === "disable" || action === "end") { setConfirm({ action, slugs }); setTyped(""); return; }
    apply(action, slugs);
  }
  function apply(action: TenantActionT, slugs: string[]) {
    setConfirm(null);
    start(async () => {
      const r = await tenantsAction(slugs, action).catch(() => ({ ok: false, message: "حصلت مشكلة، جرّب تاني." }));
      setNote(r);
      if (r.ok) setPicked(new Set());
    });
  }
  const names = (slugs: string[]) => rows.filter((r) => slugs.includes(r.slug)).map((r) => r.name);

  return (
    <div className="sa-tenants">
      <div className="sa-toolbar">
        <div className="sa-chips" role="tablist" aria-label="الحالة">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={filter === f.id ? "on" : undefined} onClick={() => setFilter(f.id)}>
              {f.label} <span>{counts[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
        {partners.length > 0 && (
          <select className="sa-source" value={source} onChange={(e) => setSource(e.target.value)} aria-label="الشريك">
            <option value="">كل المصادر</option>
            <option value="-">المنصة (من غير شريك)</option>
            {partners.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
          </select>
        )}
        <input className="sa-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر بالاسم أو العنوان…" aria-label="بحث" />
      </div>

      <div className={`sa-bulk${selected.length ? " on" : ""}`} aria-live="polite">
        {selected.length ? (
          <>
            <b>{selected.length} متحدد</b>
            {BULK.map((a) => (
              <button key={a} type="button" className={`btn-sm ${a === "delete" ? "danger" : "ghost"}`} disabled={busy} onClick={() => run(a, selected.map((r) => r.slug))}>
                {TENANT_ACTION_LABEL[a]}
              </button>
            ))}
            <button type="button" className="f-link" onClick={() => setPicked(new Set())}>إلغاء التحديد</button>
          </>
        ) : <span className="a-sub">حدد مدرس أو أكتر من المربعات علشان تطبّق إجراء على الكل مرة واحدة.</span>}
      </div>
      {note && <p className={`sa-note${note.ok ? " ok" : ""}`} role="status">{note.message} <button type="button" className="f-link" onClick={() => setNote(null)}>×</button></p>}

      <div className="sa-table-wrap">
        <table className="a-table sa-table click">
          <thead>
            <tr>
              <th className="sa-check"><input type="checkbox" checked={allShown} onChange={toggleAll} aria-label="تحديد الكل" /></th>
              <th>المدرس</th>
              <th>الحالة</th>
              <th>العنوان</th>
              <th>الشريك</th>
              <th>زوار الشهر</th>
              <th>اتعمل</th>
              <th aria-label="إجراءات" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.slug} className={picked.has(r.slug) ? "picked" : undefined}
                onClick={(e) => { if (!(e.target as HTMLElement).closest("a, button, input, label")) window.location.href = `/admin/tenants/${r.slug}`; }}>
                <td className="sa-check"><input type="checkbox" checked={picked.has(r.slug)} onChange={() => toggle(r.slug)} aria-label={`تحديد ${r.name}`} /></td>
                <td>
                  <a className="sa-name" href={`/admin/tenants/${r.slug}`}>{r.name}</a>
                  <span className="sa-meta"><code dir="ltr">{r.slug}</code>{r.english && <span className="a-lang en" dir="ltr">EN</span>}{r.fromTrial && <span className="sa-tag">من التجربة</span>}</span>
                </td>
                <td>
                  <span className={`sa-state ${r.state}`}>{STATE_LABEL[r.state]}</span>
                  {r.trialEndsAt && r.state !== "off" && <small className="sa-sub">{fromNow(r.trialEndsAt, now)}</small>}
                </td>
                <td><a dir="ltr" href={r.siteUrl} target="_blank" rel="noopener" className="sa-url">{r.siteLabel}</a></td>
                <td>{r.partner ? <a className="sa-tag partner" href={`/admin/partners/${r.partner.slug}`}>{r.partner.name}</a> : <span className="a-sub">—</span>}</td>
                <td className="num">{r.visitors.toLocaleString("en-US")}</td>
                <td>{r.createdAt ? <small>{fromNow(r.createdAt, now)}</small> : "—"}</td>
                <td className="sa-row-actions">
                  <a className="btn-sm ghost" href={`${r.siteUrl}/admin`} title="لوحة تحكم المدرس">لوحته</a>
                  {r.state === "trial" || r.state === "trialOver"
                    ? <button type="button" className="btn-sm ghost" disabled={busy} onClick={() => run("extend", [r.slug])}>+24 ساعة</button>
                    : null}
                  {r.state === "off"
                    ? <button type="button" className="btn-sm ghost" disabled={busy} onClick={() => run("enable", [r.slug])}>تشغيل</button>
                    : <button type="button" className="btn-sm ghost" disabled={busy} onClick={() => run("disable", [r.slug])}>إيقاف</button>}
                  <button type="button" className="btn-sm ghost danger" disabled={busy} onClick={() => run("delete", [r.slug])} aria-label={`حذف ${r.name}`}>حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="an-empty">مفيش مدرسين هنا.</p>}
      </div>

      {confirm && (
        <div className="sa-modal" role="dialog" aria-modal="true" aria-labelledby="sa-confirm-title" onClick={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="sa-modal-card">
            <h2 id="sa-confirm-title">{TENANT_ACTION_LABEL[confirm.action]} · {confirm.slugs.length} {confirm.slugs.length === 1 ? "مدرس" : "مدرسين"}</h2>
            <ul className="sa-names">{names(confirm.slugs).slice(0, 8).map((n) => <li key={n}>{n}</li>)}{confirm.slugs.length > 8 && <li>و{confirm.slugs.length - 8} كمان</li>}</ul>
            {confirm.action === "delete" ? (
              <>
                <p className="a-alert">الحذف نهائي: الموقع والحسابات والطلبات والاختبارات والإحصائيات والصور هتتمسح ومش هترجع. طلبات التجربة بتفضل في «طلبات التجربة».</p>
                <label className="f-field"><span className="f-label">اكتب «حذف» للتأكيد</span><input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></label>
              </>
            ) : confirm.action === "disable" ? <p className="a-sub">الموقع هيقف عن الطلاب لحد ما تشغّله تاني. البيانات بتفضل زي ما هي.</p>
              : <p className="a-sub">التجربة هتنتهي دلوقتي: الموقع يظهر «الفترة التجريبية انتهت» ودخول المدرس يتقفل.</p>}
            <div className="sa-modal-actions">
              <button type="button" className="btn-sm ghost" onClick={() => setConfirm(null)}>رجوع</button>
              <button type="button" className={`btn-sm ${confirm.action === "delete" ? "danger" : "primary"}`} disabled={confirm.action === "delete" && typed.trim() !== "حذف"}
                onClick={() => apply(confirm.action, confirm.slugs)}>
                {TENANT_ACTION_LABEL[confirm.action]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
