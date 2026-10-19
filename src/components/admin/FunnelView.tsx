import type { Funnel } from "@/lib/server/funnel";
import { listTenants } from "@/lib/server/repo";

const n = (v: number) => v.toLocaleString("en-US");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

const STEP = { 1: "الخطوة 1 · عنك", 2: "الخطوة 2 · شكل موقعك", 3: "الخطوة 3 · التواصل", 4: "الخطوة 4 · الحساب والعنوان" } as const;
const REJECT: Record<string, string> = {
  limit: "وقفهم حد الطلبات (نفس الشبكة)", device: "عملوا موقع من نفس الجهاز قبل كده", phone: "الرقم مستخدم أو غلط",
  address: "العنوان متاخد", form: "بيانات ناقصة",
};

/** A sign-up page's funnel (the platform home page, or a partner's: title): how many got to each step, pressed build, and got a site. */
export async function FunnelView({ f, title }: { f: Funnel; title?: string }) {
  const tenants = await listTenants().catch(() => []);
  const rows: { label: string; value: number }[] = [
    { label: "زاروا صفحة التجربة", value: f.views },
    ...([1, 2, 3, 4] as const).map((s) => ({ label: STEP[s], value: f.steps[s] })),
    { label: "ضغطوا «ابني موقعي»", value: f.submits },
    { label: "موقعهم اتعمل", value: f.built },
  ];
  const top = Math.max(1, ...rows.map((r) => r.value));
  const rejected = Object.entries(f.rejected).sort((a, b) => b[1] - a[1]);
  return (
    <section className="a-panel sa-funnel">
      <h2>{title ?? "صفحة التجربة (myostaz.com)"}</h2>
      <p className="a-sub">كل خطوة محسوبة مرة واحدة لكل فتحة صفحة. الأجهزة الآلية مش محسوبة. إجمالي المدرسين دلوقتي: <b>{n(tenants.length)}</b>.</p>
      <ol className="sa-steps">
        {rows.map((r, i) => {
          const prev = i ? rows[i - 1].value : r.value;
          return (
            <li key={r.label}>
              <span className="sa-step-label">{r.label}</span>
              <span className="sa-step-bar"><i style={{ inlineSize: `${(r.value / top) * 100}%` }} /></span>
              <b className="num">{n(r.value)}</b>
              <small className="a-sub">{i === 0 ? "" : `${pct(r.value, rows[0].value)}% من الزوار${prev ? ` · ${pct(r.value, prev)}% من اللي قبلها` : ""}`}</small>
            </li>
          );
        })}
      </ol>
      {rejected.length > 0 && (
        <>
          <h3>اترفض البناء</h3>
          <ul className="sa-feed">{rejected.map(([k, v]) => <li key={k}><span>{REJECT[k] ?? k}</span><b className="num">{n(v)}</b></li>)}</ul>
        </>
      )}
    </section>
  );
}
