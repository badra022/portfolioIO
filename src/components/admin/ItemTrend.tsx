import type { DayPoint } from "@/lib/server/library";

const fmt = (n: number) => n.toLocaleString("en-US");
const label = (day: string) => `${Number(day.slice(8))}/${Number(day.slice(5, 7))}`;

/**
 * One page's numbers per day (admin/library/<kind>/<path>): views as bars, and a second
 * series (plays, students who started) as thinner bars on top. Newest day on the left,
 * like the other charts that read right to left.
 */
export function ItemTrend({ points, title, second }: { points: DayPoint[]; title: string; second?: string }) {
  const W = 640, H = 200, pad = 24;
  const max = Math.max(1, ...points.map((p) => Math.max(p.views, p.second)));
  const step = W / Math.max(1, points.length);
  const bw = Math.max(2, Math.min(24, step - (points.length > 60 ? 1 : 3)));
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const every = Math.max(1, Math.ceil(points.length / 7));
  const total = points.reduce((n, p) => n + p.views, 0);
  const total2 = points.reduce((n, p) => n + p.second, 0);
  return (
    <section className="a-panel an-daily ps-trend">
      <div className="ps-trend-head">
        <h2>{title}</h2>
        <b dir="ltr">{fmt(total)}</b>
      </div>
      <p className="a-sub">
        <span className="sw visitors" /> مشاهدات
        {second && <> · <span className="sw contacts" /> {second}: {fmt(total2)}</>}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${fmt(total)}`}>
        <line x1="0" x2={W} y1={pad} y2={pad} className="an-grid" />
        <text x={W} y={pad - 8} className="an-tick" textAnchor="end">{fmt(max)}</text>
        <line x1="0" x2={W} y1={H - pad} y2={H - pad} className="an-axis" />
        {points.map((p, i) => {
          const x0 = W - (i + 1) * step;
          const x = x0 + (step - bw) / 2;
          return (
            <g key={p.day} className="an-day">
              <title>{`${label(p.day)}: ${fmt(p.views)} مشاهدة${second ? ` · ${fmt(p.second)} ${second}` : ""}`}</title>
              <rect x={x0} y={0} width={step} height={H} className="an-hit" />
              {p.views > 0 && <rect x={x} y={y(p.views)} width={bw} height={H - pad - y(p.views)} rx={Math.min(4, bw / 2)} className="visitors" />}
              {second && p.second > 0 && <rect x={x + bw / 4} y={y(p.second)} width={bw / 2} height={H - pad - y(p.second)} rx={Math.min(3, bw / 4)} className="contacts" />}
              {i % every === 0 && <text x={x + bw / 2} y={H - 6} className="an-tick" textAnchor="middle">{label(p.day)}</text>}
            </g>
          );
        })}
      </svg>
    </section>
  );
}

/** A tiny bar chart of the last days (one item's row on «أداء الصفحات»). */
export function Spark({ values }: { values: number[] }) {
  const W = 120, H = 28;
  const max = Math.max(1, ...values);
  const step = W / Math.max(1, values.length);
  return (
    <svg className="lib-spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {values.map((v, i) => v > 0 && <rect key={i} x={W - (i + 1) * step} y={H - (v / max) * H} width={Math.max(1, step - 1)} height={(v / max) * H} />)}
    </svg>
  );
}
