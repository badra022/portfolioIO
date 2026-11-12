import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSuper } from "@/lib/server/auth";
import { USAGE_DAYS, usageReport } from "@/lib/server/mcp/usage";
import { formatWhen } from "@/lib/admin/format";

export const metadata: Metadata = { title: "استخدام Claude (MCP)" };

const RANGES = [1, 7, 30] as const;
const n = (v: number) => v.toLocaleString("en-US");
const kb = (bytes: number) => (bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`);

/** Super admin only, on the platform host: what AI apps did through the MCP server, and where they fail. */
export default async function McpUsagePage({ params, searchParams }: PageProps<"/sites/[site]/admin/mcp">) {
  const site = decodeURIComponent((await params).site);
  if (site !== "_platform") notFound();
  await requireSuper(site);
  const q = (await searchParams).days;
  const days = RANGES.find((d) => String(d) === (Array.isArray(q) ? q[0] : q)) ?? 7;
  const r = await usageReport(days);
  const rate = r.calls ? Math.round((r.errors / r.calls) * 100) : 0;

  return (
    <>
      <div className="a-head">
        <h1>استخدام Claude (MCP)</h1>
        <p className="a-sub">كل طلب عمله تطبيق ذكاء اصطناعي على المنصة: مين، أنهي أداة، حجم الرد، ولو فشل ليه. السجل بيتحفظ {USAGE_DAYS} يوم.</p>
        <nav className="an-ranges" aria-label="الفترة">
          {RANGES.map((d) => <a key={d} href={`?days=${d}`} aria-current={d === days ? "page" : undefined}>{d === 1 ? "آخر 24 ساعة" : `آخر ${d} يوم`}</a>)}
        </nav>
      </div>

      <section className="hm-stats" aria-label="الأرقام">
        <div className="hm-stat"><span>طلب</span><b>{n(r.calls)}</b></div>
        <div className="hm-stat"><span>فشل ({rate}%)</span><b>{n(r.errors)}</b></div>
        <div className="hm-stat"><span>حساب</span><b>{n(r.actors.length)}</b></div>
      </section>

      {r.calls === 0 && <p className="an-empty">مفيش طلبات في الفترة دي.</p>}

      {r.codes.length > 0 && (
        <section className="an-table">
          <h2>أكتر الأخطاء</h2>
          <table className="a-table">
            <thead><tr><th>الخطأ</th><th>الأداة</th><th>المرات</th><th>آخر مرة</th></tr></thead>
            <tbody>
              {r.codes.map((c) => (
                <tr key={`${c.error}:${c.tool}`}><td dir="ltr"><code>{c.error}</code></td><td dir="ltr"><code>{c.tool}</code></td><td className="num">{n(c.calls)}</td><td>{formatWhen(c.last)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {r.tools.length > 0 && (
        <section className="an-table">
          <h2>الأدوات</h2>
          <table className="a-table">
            <thead><tr><th>الأداة</th><th>الطلبات</th><th>فشل</th><th>متوسط الوقت</th><th>متوسط حجم الرد</th><th>أكبر رد</th></tr></thead>
            <tbody>
              {r.tools.map((t) => (
                <tr key={t.tool}><td dir="ltr"><code>{t.tool}</code></td><td className="num">{n(t.calls)}</td><td className="num">{n(t.errors)}</td><td className="num"><bdi dir="ltr">{n(t.avgMs)} ms</bdi></td><td className="num"><bdi dir="ltr">{kb(t.avgBytes)}</bdi></td><td className="num"><bdi dir="ltr">{kb(t.maxBytes)}</bdi></td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {r.actors.length > 0 && (
        <section className="an-table">
          <h2>الحسابات</h2>
          <table className="a-table">
            <thead><tr><th>الحساب</th><th>النوع</th><th>الطلبات</th><th>فشل</th><th>آخر طلب</th></tr></thead>
            <tbody>
              {r.actors.map((a) => (
                <tr key={`${a.scope}:${a.actor}`}><td>{a.actor}</td><td>{a.scope === "super" ? "الإدارة" : a.scope === "partner" ? "شريك" : "مدرس"}</td><td className="num">{n(a.calls)}</td><td className="num">{n(a.errors)}</td><td>{formatWhen(a.last)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {r.recentErrors.length > 0 && (
        <section className="an-table">
          <h2>آخر الأخطاء</h2>
          <table className="a-table">
            <thead><tr><th>الوقت</th><th>الحساب</th><th>المدرس</th><th>الأداة</th><th>الخطأ</th></tr></thead>
            <tbody>
              {r.recentErrors.map((e, i) => (
                <tr key={i}><td>{formatWhen(e.at)}</td><td>{e.actor}</td><td dir="ltr">{e.slug ?? "—"}</td><td dir="ltr"><code>{e.tool}</code></td><td dir="ltr"><code>{e.error}</code></td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
