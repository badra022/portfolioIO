import type { Report } from "@/lib/server/analytics";
import { PLACE } from "@/lib/admin/places";

const CHANNEL: Record<string, string> = {
  whatsapp: "واتساب", telegram: "تيليجرام", messenger: "ماسنجر", phone: "اتصال",
  youtube: "يوتيوب", tiktok: "تيك توك", facebook: "فيسبوك", instagram: "إنستجرام", whatsappChannel: "قناة الواتساب", x: "إكس",
  video: "تشغيل فيديو في الصفحة", link: "روابط أخرى", form: "نموذج (سابوا بياناتهم)",
};
const SOURCE: Record<string, string> = {
  direct: "مباشر / واتساب / بدون مصدر", google: "جوجل", facebook: "فيسبوك", instagram: "إنستجرام", youtube: "يوتيوب",
  tiktok: "تيك توك", x: "إكس", telegram: "تيليجرام", whatsapp: "واتساب", other: "مواقع أخرى",
};
const DEVICE: Record<string, string> = { phone: "موبايل", tablet: "تابلت", desktop: "كمبيوتر" };
const DWELL: Record<string, string> = { "0-10": "أقل من 10 ثواني", "10-30": "10–30 ثانية", "30-120": "30 ثانية – 2 دقيقة", "120-600": "2–10 دقائق", "600+": "أكثر من 10 دقائق" };

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const duration = (s: number) => (s < 60 ? `${s} ث` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} د`);

function Tile({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className={`an-tile${strong ? " strong" : ""}`}>
      <span>{label}</span>
      <b dir="ltr">{value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}

/** Horizontal bars for one measure (a single series: no legend, the title names it). */
function Bars({ title, hint, rows, total, labels, unit }: {
  title: string;
  hint?: string;
  rows: { key: string; value: number }[];
  total?: number;
  labels: Record<string, string>;
  unit?: (r: { key: string; value: number }) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="a-panel an-bars">
      <h2>{title}</h2>
      {hint && <p className="a-sub">{hint}</p>}
      {rows.length === 0 ? <p className="an-empty">لا توجد بيانات بعد.</p> : (
        <ul>
          {rows.map((r) => (
            <li key={r.key} title={`${labels[r.key] ?? r.key}: ${fmt(r.value)}`}>
              <span className="an-lbl">{labels[r.key] ?? r.key}</span>
              <span className="an-track">{r.value > 0 && <i style={{ inlineSize: `${(r.value / max) * 100}%` }} />}</span>
              <span className="an-val" dir="ltr">{unit ? unit(r) : fmt(r.value)}{total ? <small> · {pct(r.value, total)}%</small> : null}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Last 30 days: visitors per day, with the visitors who contacted the teacher inside each bar. */
function Daily({ data }: { data: Report["daily"] }) {
  const W = 600, H = 180, pad = 22;
  const max = Math.max(1, ...data.map((d) => d.visitors));
  const step = W / data.length;
  const bw = Math.max(4, step - 4);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const label = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
  return (
    <section className="a-panel an-daily">
      <h2>آخر 30 يوم</h2>
      <div className="an-legend">
        <span><i className="sw visitors" />زوار</span>
        <span><i className="sw contacts" />تواصلوا (واتساب، تيليجرام، ماسنجر، اتصال)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="زوار كل يوم في آخر 30 يوم، ومن تواصل منهم">
        <line x1="0" x2={W} y1={H - pad} y2={H - pad} className="an-axis" />
        <text x={W} y={pad - 8} className="an-tick" textAnchor="end">{fmt(max)}</text>
        <line x1="0" x2={W} y1={pad} y2={pad} className="an-grid" />
        {data.map((d, i) => {
          // Time runs right to left, like the Arabic text: oldest day on the right, today on the left.
          const x = W - (i + 1) * step + (step - bw) / 2;
          return (
            <g key={d.day} className="an-day">
              <title>{`${label(d.day)} — زوار: ${fmt(d.visitors)} · مشاهدات: ${fmt(d.views)} · تواصلوا: ${fmt(d.contacts)}`}</title>
              <rect x={W - (i + 1) * step} y={0} width={step} height={H} className="an-hit" />
              {d.visitors > 0 && <rect x={x} y={y(d.visitors)} width={bw} height={H - pad - y(d.visitors)} rx="2" className="visitors" />}
              {d.contacts > 0 && <rect x={x + bw * 0.2} y={y(d.contacts)} width={bw * 0.6} height={H - pad - y(d.contacts)} rx="2" className="contacts" />}
              {(data.length - 1 - i) % 7 === 0 && <text x={x + bw / 2} y={H - 6} className="an-tick" textAnchor="middle">{label(d.day)}</text>}
            </g>
          );
        })}
      </svg>
      <details className="an-table">
        <summary>عرض كجدول</summary>
        <table className="a-table">
          <thead><tr><th>اليوم</th><th>زوار</th><th>مشاهدات</th><th>تواصلوا</th></tr></thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.day}><td dir="ltr">{d.day}</td><td>{fmt(d.visitors)}</td><td>{fmt(d.views)}</td><td>{fmt(d.contacts)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

export function AnalyticsView({ r, sectionOrder }: { r: Report; sectionOrder: string[] }) {
  const contactRate = pct(r.converted.contact, r.visitors);
  const socialRate = pct(r.converted.social, r.visitors);
  const anyRate = pct(r.converted.any, r.visitors);
  const sections = sectionOrder.map((key) => ({ key, value: r.sections[key] ?? 0 }));
  return (
    <>
      <div className="an-tiles">
        <Tile strong label="زوار" value={fmt(r.visitors)} note="كل جهاز يُحسب مرة واحدة" />
        <Tile label="مشاهدات الصفحة" value={fmt(r.views)} />
        <Tile strong label="تواصلوا معاك" value={fmt(r.converted.contact)} note={`${contactRate}% من الزوار · واتساب، تيليجرام، ماسنجر، اتصال، نموذج`} />
        <Tile label="راحوا لقنواتك" value={fmt(r.converted.social)} note={`${socialRate}% من الزوار · يوتيوب، تيك توك، فيسبوك...`} />
        <Tile label="متوسط وقت المشاهدة" value={duration(r.dwell.avg)} />
      </div>

      {r.visitors > 0 && (
        <p className="an-pitch">
          من كل <b>100</b> زائر، <b>{Math.round(contactRate)}</b> تواصلوا معاك مباشرة، و<b>{Math.round(anyRate)}</b> ضغطوا على زر تواصل أو قناة.
        </p>
      )}

      <Daily data={r.daily} />

      <div className="an-grid2">
        <Bars title="الضغطات حسب المكان اللي راحوله" rows={r.clicks} labels={CHANNEL} hint="كل ضغطة على زر أو رابط يفتح خارج الصفحة." />
        <Bars title="الضغطات حسب مكان الزر في الصفحة" rows={r.clicksAt} labels={PLACE} />
        <Bars
          title="الأقسام اللي وصلها الزوار"
          hint="نسبة المشاهدات اللي وصلت كل قسم، بترتيب الصفحة."
          rows={sections}
          total={r.views}
          labels={PLACE}
        />
        <Bars title="مدة البقاء في الصفحة" rows={r.dwell.buckets} total={r.dwell.buckets.reduce((a, b) => a + b.value, 0)} labels={DWELL} />
        <Bars title="الأجهزة" rows={r.devices} total={r.views} labels={DEVICE} />
        <Bars title="جايين منين" rows={r.sources} total={r.views} labels={SOURCE} />
      </div>
    </>
  );
}
