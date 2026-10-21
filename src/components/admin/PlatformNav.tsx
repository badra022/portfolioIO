"use client";

import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { OstazLogo } from "@/components/brand/OstazLogo";

const LINKS = [
  { href: "/admin", icon: "home", label: "الرئيسية", match: (p: string) => p === "/admin" },
  { href: "/admin/tenants", icon: "users", label: "المدرسين", match: (p: string) => p.startsWith("/admin/tenants") },
  { href: "/admin/trials", icon: "form", label: "طلبات التجربة", match: (p: string) => p.startsWith("/admin/trials"), badge: true },
  { href: "/admin/leads", icon: "chat", label: "طلبات التواصل", match: (p: string) => p.startsWith("/admin/leads") },
  { href: "/admin/partners", icon: "link", label: "الشركاء", match: (p: string) => p.startsWith("/admin/partners") },
  { href: "/admin/stats", icon: "trophy", label: "الإحصائيات", match: (p: string) => p.startsWith("/admin/stats") },
] as const;

/** The super admin's menu on the platform host: a side menu on computers, a tab bar on phones. */
export function PlatformNav({ who, newTrials }: { who: string; newTrials: number }) {
  const path = (usePathname() ?? "/admin").replace(/\/$/, "") || "/admin";
  const item = (l: (typeof LINKS)[number], tab: boolean) => {
    const on = l.match(path);
    const n = "badge" in l && l.badge ? newTrials : 0;
    return (
      <a key={l.href} href={l.href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
        {tab ? <span className="an-tab-ico"><Icon name={l.icon} />{n > 0 && <span className="an-badge">{n}</span>}</span> : <Icon name={l.icon} />}
        <span>{l.label}</span>
        {!tab && n > 0 && <span className="an-badge">{n}</span>}
      </a>
    );
  };
  return (
    <>
      <aside className="an-side">
        <div className="sa-brand"><OstazLogo size={30} href="/admin" /></div>
        <div className="an-teacher">
          <span className="an-avatar" aria-hidden="true">★</span>
          <div><b>الإدارة العامة</b><span className="a-sub">{who}</span></div>
        </div>
        <nav className="an-nav" aria-label="القائمة">{LINKS.map((l) => item(l, false))}</nav>
        <a className="btn-sm primary sa-new" href="/admin/tenants/new">+ مدرس جديد</a>
        <a className="sa-site" href="/" target="_blank" rel="noopener">صفحة المنصة ↗</a>
        <a className="an-logout" href="/logout">تسجيل الخروج</a>
      </aside>
      <nav className="an-tabs sa-tabs" aria-label="القائمة السريعة">
        {LINKS.map((l) => item(l, true))}
        <a href="/logout"><span className="an-tab-ico"><Icon name="close" /></span><span>خروج</span></a>
      </nav>
    </>
  );
}
