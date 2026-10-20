"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { NAV, locate, type NavItem } from "@/lib/admin/nav";

type Props = {
  base: string;
  name: string;
  /** The teacher's public address, shown under their name. */
  siteLabel: string;
  siteUrl: string;
  isSuper: boolean;
  counts: { requests: number; grading: number; complaints: number };
};

/** The part of the address after <base>/admin ("" on the home page). */
function useRest(base: string): string {
  const pathname = usePathname() ?? "";
  const root = `${base}/admin`;
  return pathname.startsWith(root) ? pathname.slice(root.length).replace(/\/$/, "") : "";
}

const initials = (name: string) => name.replace(/^(أ\.|م\.|د\.|مستر|ميس)\s*/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join(" ");

function Links({ base, rest, isSuper, counts, onPick }: { base: string; rest: string; isSuper: boolean; counts: Props["counts"]; onPick?: () => void }) {
  const here = locate(rest);
  const badge = (it: NavItem) => (it.badge ? counts[it.badge] : 0);
  const visible = (items: NavItem[]) => items.filter((it) => !it.superOnly || isSuper);
  return (
    <nav className="an-nav" aria-label="القائمة">
      <a href={`${base}/admin`} className={rest === "" ? "on" : undefined} aria-current={rest === "" ? "page" : undefined} onClick={onPick}>
        <Icon name="home" />الرئيسية وترتيب الصفحة
      </a>
      {NAV.map((g) => {
        const open = here?.group.id === g.id;
        const total = g.subs.reduce((n, sub) => n + visible(sub.items).reduce((m, it) => m + badge(it), 0), 0);
        return (
          <details key={g.id} className="an-group" open={open || undefined}>
            <summary>
              <Icon name={g.icon} /><span>{g.label}</span>
              {total > 0 && !open && <span className="an-badge">{total}</span>}
              <i className="an-chev" aria-hidden="true" />
            </summary>
            <div className="an-subs">
              {g.subs.map((sub) => {
                const items = visible(sub.items);
                if (!items.length) return null;
                const subOpen = here?.sub.id === sub.id;
                const subTotal = items.reduce((n, it) => n + badge(it), 0);
                return (
                  <details key={sub.id} className="an-sub" open={subOpen || undefined}>
                    <summary>
                      <span>{sub.label}</span>
                      {subTotal > 0 && !subOpen && <span className="an-badge">{subTotal}</span>}
                      <i className="an-chev" aria-hidden="true" />
                    </summary>
                    <div className="an-items">
                      {items.map((it) => {
                        const on = here?.item === it;
                        return (
                          <a key={it.path} href={`${base}/admin${it.path}`} className={on ? "on" : undefined} aria-current={on ? "page" : undefined} onClick={onPick}>
                            <span>{it.label}</span>
                            {badge(it) > 0 && <span className="an-badge">{badge(it)}</span>}
                          </a>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          </details>
        );
      })}
    </nav>
  );
}

/**
 * The teacher admin's navigation: a side menu on computers (categories that open
 * to their pages, the current one open and highlighted), and on phones a tab bar
 * at the bottom with the full menu one tap away.
 */
export function AdminNav(props: Props) {
  const { base, name, siteLabel, siteUrl, isSuper, counts } = props;
  const rest = useRest(base);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { setDrawer(false); }, [rest]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const teacher = (
    <div className="an-teacher">
      <span className="an-avatar" aria-hidden="true">{initials(name) || "؟"}</span>
      <div>
        <b>{name}</b>
        <a href={siteUrl} target="_blank" rel="noopener" dir="ltr">{siteLabel}</a>
      </div>
    </div>
  );
  const tab = (href: string, icon: string, label: string, on: boolean, n = 0) => (
    <a href={href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
      <span className="an-tab-ico"><Icon name={icon} />{n > 0 && <span className="an-badge">{n}</span>}</span>{label}
    </a>
  );

  return (
    <>
      <aside className="an-side">
        <a className="an-brand" href={`${base}/admin`}><span aria-hidden="true">أ</span>لوحة التحكم</a>
        {teacher}
        <Links base={base} rest={rest} isSuper={isSuper} counts={counts} />
        <div className="an-help">
          <b>محتاج مساعدة؟</b>
          <span>أي حاجة مش واضحة أو عايز تعدّلها، كلّم الإدارة وهنساعدك.</span>
        </div>
        <a className="an-logout" href={`${base}/logout`}>تسجيل الخروج</a>
      </aside>

      <nav className="an-tabs" aria-label="القائمة السريعة">
        {tab(`${base}/admin`, "home", "الرئيسية", rest === "")}
        {tab(`${base}/admin/requests`, "chat", "الطلبات", rest.startsWith("/requests"), counts.requests)}
        {tab(`${base}/admin/students`, "users", "الطلاب", rest.startsWith("/students"))}
        {tab(`${base}/admin/quizzes`, "trophy", "الاختبارات", rest.startsWith("/quizzes"), counts.grading)}
        <button type="button" onClick={() => setDrawer(true)} aria-expanded={drawer}>
          <span className="an-tab-ico"><Icon name="menu" /></span>القائمة
        </button>
      </nav>

      {drawer && (
        <div className="an-drawer" role="dialog" aria-modal="true" aria-label="القائمة">
          <div className="an-drawer-head">
            {teacher}
            <button type="button" className="an-x" aria-label="إغلاق القائمة" onClick={() => setDrawer(false)}><Icon name="close" /></button>
          </div>
          <Links base={base} rest={rest} isSuper={isSuper} counts={counts} onPick={() => setDrawer(false)} />
        </div>
      )}
    </>
  );
}

/** «الامتحانات › الاختبارات الأونلاين» at the top of every page, so the teacher knows where they are. */
export function Breadcrumb({ base }: { base: string }) {
  const rest = useRest(base);
  const here = locate(rest);
  if (rest === "") return <span className="an-crumb"><b>الرئيسية</b></span>;
  return (
    <span className="an-crumb">
      <a href={`${base}/admin`}>الرئيسية</a>
      {here && <><i aria-hidden="true">‹</i><span>{here.group.label}</span><i aria-hidden="true">‹</i><span>{here.sub.label}</span><i aria-hidden="true">‹</i><a href={`${base}/admin${here.item.path}`}><b>{here.item.label}</b></a></>}
    </span>
  );
}
