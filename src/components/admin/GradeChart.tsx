import type { GradePoint } from "@/lib/server/students";

const day = (iso: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", day: "numeric", month: "short" }).format(new Date(iso));

/**
 * A student's grades over time (%), oldest on the right like the Arabic text:
 * quizzes as dots, exams as squares, joined by a line. Each point shows its
 * title, date and score on hover; the same numbers are listed under the chart.
 */
export function GradeChart({ points }: { points: GradePoint[] }) {
  if (points.length === 0) return <p className="an-empty">لسه مفيش درجات: بتظهر هنا من الاختبارات الأونلاين ونتايج الامتحانات.</p>;
  const W = 640, H = 220, padX = 52, padTop = 16, padBottom = 30;
  const step = points.length > 1 ? (W - padX * 2) / (points.length - 1) : 0;
  const x = (i: number) => (points.length > 1 ? W - padX - i * step : W / 2);
  const y = (p: number) => padTop + (1 - p / 100) * (H - padTop - padBottom);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.percent).toFixed(1)}`).join(" ");
  const every = Math.max(1, Math.ceil(points.length / 7));
  return (
    <svg className="st-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`الدرجات: ${points.map((p) => `${p.title} ${p.percent}%`).join("، ")}`}>
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={padX} x2={W - padX} y1={y(g)} y2={y(g)} className={g === 50 ? "st-mid" : "an-grid"} />
          <text x={padX - 18} y={y(g) + 4} className="an-tick" textAnchor="end">{g}%</text>
        </g>
      ))}
      <path d={line} className="st-line" />
      {points.map((p, i) => (
        <g key={i}>
          <title>{`${p.title} · ${day(p.at)} · ${p.score} (${p.percent}%)`}</title>
          {p.kind === "quiz"
            ? <circle cx={x(i)} cy={y(p.percent)} r={5} className={`st-pt ${p.percent >= 50 ? "ok" : "bad"}`} />
            : <rect x={x(i) - 5} y={y(p.percent) - 5} width={10} height={10} rx={2} className={`st-pt ${p.percent >= 50 ? "ok" : "bad"}`} />}
          {i % every === 0 && <text x={x(i)} y={H - 8} className="an-tick" textAnchor="middle">{day(p.at)}</text>}
        </g>
      ))}
    </svg>
  );
}
