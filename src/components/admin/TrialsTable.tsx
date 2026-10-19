"use client";

import { useMemo, useState, useTransition } from "react";
import { tenantsAction } from "@/app/sites/[site]/admin/actions";
import { fromNow } from "@/lib/admin/tenant-actions";

export type TrialLead = {
  id: string;
  createdAt: string;
  /** The date as text, made on the server (the same in the browser). */
  createdLabel: string;
  name: string;
  subject: string | null;
  phone: string | null;
  english: boolean;
  username: string | null;
  notes: string | null;
  slug: string;
  siteUrl: string;
  siteLabel: string;
  /** running: trial on · ended: trial over · activated: a normal site now · off: site stopped · deleted: site gone. */
  state: "running" | "ended" | "activated" | "off" | "deleted";
  trialEndsAt: string | null;
  /** The partner page it came from (null = the platform's home page). */
  partner: { slug: string; name: string } | null;
  /** Answers to the partner's extra fields, by label. */
  extra: Record<string, string> | null;
};

const LABEL: Record<TrialLead["state"], string> = { running: "التجربة شغالة", ended: "التجربة انتهت", activated: "اتفعّل", off: "متوقف", deleted: "اتمسح" };
const CLASS: Record<TrialLead["state"], string> = { running: "trial", ended: "trialOver", activated: "live", off: "off", deleted: "off" };
const FILTERS: { id: "all" | "notes" | TrialLead["state"]; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "running", label: "شغالة" },
  { id: "ended", label: "انتهت" },
  { id: "activated", label: "اتفعّلت" },
  { id: "notes", label: "فيها ملاحظات" },
  { id: "deleted", label: "اتمسحت" },
];

/** Every trial request (the lead) with its site's state, newest first, and quick actions on the site. */
/** now: the server's time, so the «من ساعتين» texts match between server and browser. */
/** hidePartner: on one partner's own page, where the column would say the same thing on every row. */
export function TrialsTable({ leads, now, hidePartner }: { leads: TrialLead[]; now: number; hidePartner?: boolean }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [q, setQ] = useState("");
  // "" = every source, "-" = the platform's home page, else a partner's slug.
  const [source, setSource] = useState("");
  const partners = useMemo(() => [...new Map(leads.filter((l) => l.partner).map((l) => [l.partner!.slug, l.partner!.name]))], [leads]);
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length, notes: leads.filter((l) => l.notes || l.extra).length };
    for (const l of leads) c[l.state] = (c[l.state] ?? 0) + 1;
    return c;
  }, [leads]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return leads.filter((l) => (filter === "all" || (filter === "notes" ? Boolean(l.notes || l.extra) : l.state === filter))
      && (!source || (source === "-" ? !l.partner : l.partner?.slug === source))
      && (!term || [l.name, l.subject ?? "", l.phone ?? "", l.slug, l.notes ?? ""].some((v) => v.toLowerCase().includes(term))));
  }, [leads, filter, q, source]);
  const act = (slug: string, action: "extend" | "activate") => start(async () => {
    const r = await tenantsAction([slug], action).catch(() => ({ ok: false, message: "حصلت مشكلة." }));
    setNote(r.message);
  });

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
        {!hidePartner && partners.length > 0 && (
          <select className="sa-source" value={source} onChange={(e) => setSource(e.target.value)} aria-label="المصدر">
            <option value="">كل المصادر</option>
            <option value="-">صفحة المنصة</option>
            {partners.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
          </select>
        )}
        <input className="sa-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر بالاسم أو الرقم أو المادة…" aria-label="بحث" />
      </div>
      {note && <p className="sa-note ok" role="status">{note} <button type="button" className="f-link" onClick={() => setNote("")}>×</button></p>}
      <div className="sa-table-wrap">
        <table className="a-table sa-table">
          <thead><tr><th>طلب من</th><th>المدرس</th><th>واتساب</th><th>الموقع</th>{!hidePartner && <th>المصدر</th>}<th>الحالة</th><th>ملاحظات</th><th aria-label="إجراءات" /></tr></thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id}>
                <td><b>{fromNow(l.createdAt, now)}</b><small className="sa-sub">{l.createdLabel}</small></td>
                <td>
                  <span className="sa-name">{l.name}</span>
                  <span className="sa-meta">{l.subject}{l.english && <span className="a-lang en" dir="ltr">EN</span>}{l.username && <code dir="ltr">{l.username}</code>}</span>
                </td>
                <td>{l.phone ? <a dir="ltr" className="sa-url" href={`https://wa.me/${l.phone}`} target="_blank" rel="noopener">+{l.phone}</a> : "—"}</td>
                <td>{l.state === "deleted" ? <span className="a-sub" dir="ltr">{l.siteLabel}</span> : <a dir="ltr" className="sa-url" href={l.siteUrl} target="_blank" rel="noopener">{l.siteLabel}</a>}</td>
                {!hidePartner && <td>{l.partner ? (l.partner.slug ? <a className="sa-tag partner" href={`/admin/partners/${l.partner.slug}`}>{l.partner.name}</a> : <span className="sa-tag">{l.partner.name}</span>) : <span className="a-sub">المنصة</span>}</td>}
                <td>
                  <span className={`sa-state ${CLASS[l.state]}`}>{LABEL[l.state]}</span>
                  {l.trialEndsAt && (l.state === "running" || l.state === "ended") && <small className="sa-sub">{fromNow(l.trialEndsAt, now)}</small>}
                </td>
                <td className="sa-notes">{l.notes || l.extra ? (
                  <details>
                    <summary>{l.notes ? `${l.notes.slice(0, 40)}${l.notes.length > 40 ? "…" : ""}` : `${Object.keys(l.extra ?? {}).length} إجابة إضافية`}</summary>
                    {l.notes && <p>{l.notes}</p>}
                    {l.extra && <dl className="sa-extra">{Object.entries(l.extra).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
                  </details>
                ) : <span className="a-sub">—</span>}</td>
                <td className="sa-row-actions">
                  {l.state !== "deleted" && <a className="btn-sm ghost" href={`/admin/tenants/${l.slug}`}>إدارة</a>}
                  {(l.state === "running" || l.state === "ended") && <>
                    <button type="button" className="btn-sm ghost" disabled={busy} onClick={() => act(l.slug, "extend")}>+24 ساعة</button>
                    <button type="button" className="btn-sm primary" disabled={busy} onClick={() => act(l.slug, "activate")}>تفعيل</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="an-empty">مفيش طلبات هنا.</p>}
      </div>
    </div>
  );
}
