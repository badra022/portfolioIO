import type { PlatformStats, Point } from "@/lib/server/platform-stats";

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : "—");
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const pointLabel = (key: string) => (key.length === 7 ? `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : `${Number(key.slice(8))}/${Number(key.slice(5, 7))}`);

function Tile({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className={`an-tile${strong ? " strong" : ""}`}>
      <span>{label}</span>
      <b dir="ltr">{value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}

/**
 * One measure over time as columns (a single series: the title names it, no
 * legend). Time runs right to left like the Arabic text: oldest on the right.
 * Hovering a column shows its value; the numbers are also in the table below.
 */
function Trend({ title, hint, points, pick, total }: { title: string; hint?: string; points: Point[]; pick: (p: Point) => number; total: string }) {
  const W = 600, H = 170, pad = 22;
  const values = points.map(pick);
  const max = Math.max(1, ...values);
  const step = W / Math.max(1, points.length);
  const bw = Math.max(2, Math.min(28, step - (points.length > 60 ? 1 : 3)));
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const every = Math.max(1, Math.ceil(points.length / 6));
  return (
    <section className="a-panel an-daily ps-trend">
      <div className="ps-trend-head">
        <h2>{title}</h2>
        <b dir="ltr">{total}</b>
      </div>
      {hint && <p className="a-sub">{hint}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${total}`}>
        <line x1="0" x2={W} y1={pad} y2={pad} className="an-grid" />
        <text x={W} y={pad - 8} className="an-tick" textAnchor="end">{fmt(max)}</text>
        <line x1="0" x2={W} y1={H - pad} y2={H - pad} className="an-axis" />
        {points.map((p, i) => {
          const v = values[i];
          const x0 = W - (i + 1) * step;
          const x = x0 + (step - bw) / 2;
          return (
            <g key={p.key} className="an-day">
              <title>{`${pointLabel(p.key)}: ${fmt(v)}`}</title>
              <rect x={x0} y={0} width={step} height={H} className="an-hit" />
              {v > 0 && <rect x={x} y={y(v)} width={bw} height={H - pad - y(v)} rx={Math.min(4, bw / 2)} className="visitors" />}
              {(points.length - 1 - i) % every === 0 && <text x={x + bw / 2} y={H - 6} className="an-tick" textAnchor="middle">{pointLabel(p.key)}</text>}
            </g>
          );
        })}
      </svg>
    </section>
  );
}

export function PlatformStatsView({ s }: { s: PlatformStats }) {
  const b = s.breakdown;
  const unit = s.bucket === "month" ? "شهر" : "يوم";
  return (
    <>
      <div className="an-tiles">
        <Tile label="المدرسين" value={fmt(s.teachers.total)} note={`${fmt(s.teachers.active)} منشور${s.teachers.added ? ` · ${fmt(s.teachers.added)} جديد في الفترة` : ""}`} />
        <Tile strong label="المشاهدات" value={fmt(s.views)} note="كل فتحة لصفحة مدرس" />
        <Tile strong label={s.visitorsExact ? "الزوار" : "الزوار (يومي)"} value={fmt(s.visitors)}
          note={s.visitorsExact ? "زوار فريدين، كل مدرس لوحده (نفس الشخص عند مدرسين = 2)" : "مجموع الزوار الفريدين لكل يوم. للعدد الدقيق اختار يوم أو شهر أو من البداية."} />
        <Tile strong label="التفاعلات" value={fmt(s.engagements)} note="تواصل + قنوات + نماذج + اختبارات + استعلام نتايج" />
        {s.engaged !== null && <Tile label="زوار اتفاعلوا" value={fmt(s.engaged)} note={`${pct(s.engaged, s.visitors)} من الزوار تواصلوا أو راحوا لقنواتهم`} />}
      </div>

      <h2 className="a-h2">التفاعلات بالتفصيل</h2>
      <div className="an-tiles">
        <Tile label="تواصل" value={fmt(b.contacts)} note="واتساب، تيليجرام، ماسنجر، اتصال" />
        <Tile label="القنوات" value={fmt(b.channels)} note="يوتيوب، تيك توك، فيسبوك، إنستجرام…" />
        <Tile label="نماذج اتبعتت" value={fmt(b.forms)} note={b.examBookings ? `منها ${fmt(b.examBookings)} حجز امتحان` : "طلبات الطلاب من الأزرار"} />
        <Tile label="اختبارات اتحلّت" value={fmt(b.attempts)} note={`${fmt(b.finished)} سلّموا`} />
        <Tile label="استعلام عن نتيجة" value={fmt(b.lookups)} note={b.lookups ? `${pct(b.found, b.lookups)} لقوا نتيجتهم` : "بيتعد من النهاردة"} />
        <Tile label="فيديوهات اتشغلت" value={fmt(b.videos)} note="مش محسوبة في التفاعلات" />
      </div>

      <h2 className="a-h2">الامتحانات</h2>
      <div className="an-tiles">
        <Tile label="اختبارات أونلاين" value={fmt(s.exams.quizzes)} note={`${fmt(b.attempts)} طالب بدأوا في الفترة`} />
        <Tile label="امتحانات على الصفحات" value={fmt(s.exams.examCards)} note={`${fmt(b.examBookings)} حجز في الفترة`} />
        <Tile label="نتايج امتحانات" value={fmt(s.exams.resultSets)} note={`${fmt(s.exams.resultStudents)} درجة طالب`} />
      </div>

      <h2 className="a-h2">الاتجاه (كل {unit})</h2>
      <div className="an-grid2">
        <Trend title="المشاهدات" points={s.series} pick={(p) => p.views} total={fmt(s.views)} />
        <Trend title="الزوار" hint={`الزوار الفريدين في كل ${unit === "شهر" ? "يوم، مجموعين على الشهر" : "يوم"}.`} points={s.series} pick={(p) => p.visitors} total={fmt(s.series.reduce((a, p) => a + p.visitors, 0))} />
        <Trend title="التفاعلات" points={s.series} pick={(p) => p.engagements} total={fmt(s.series.reduce((a, p) => a + p.engagements, 0))} />
        <Trend title="نماذج واختبارات ونتايج" hint="اللي الطلاب عملوه جوه الصفحة: بعتوا بيانات، حلوا اختبار، أو سألوا عن نتيجة." points={s.series} pick={(p) => p.actions} total={fmt(s.series.reduce((a, p) => a + p.actions, 0))} />
      </div>
      <details className="a-panel an-table">
        <summary>عرض الاتجاه كجدول</summary>
        <table className="a-table">
          <thead><tr><th>{unit === "شهر" ? "الشهر" : "اليوم"}</th><th>مشاهدات</th><th>زوار</th><th>تفاعلات</th><th>نماذج واختبارات ونتايج</th></tr></thead>
          <tbody>
            {[...s.series].reverse().map((p) => (
              <tr key={p.key}><td dir="ltr">{p.key}</td><td>{fmt(p.views)}</td><td>{fmt(p.visitors)}</td><td>{fmt(p.engagements)}</td><td>{fmt(p.actions)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>

      <h2 className="a-h2">كل مدرس</h2>
      <div className="ps-scroll">
        <table className="a-table">
          <thead><tr><th>المدرس</th><th>مشاهدات</th><th>{s.visitorsExact ? "زوار" : "زوار (يومي)"}</th><th>تفاعلات</th><th>تواصل</th><th>قنوات</th><th>نماذج</th><th>اختبارات</th><th>نتايج</th><th /></tr></thead>
          <tbody>
            {s.perTeacher.map((t) => (
              <tr key={t.slug}>
                <td><strong>{t.name}</strong>{!t.active && <span className="a-sub"> (متوقف)</span>}</td>
                <td>{fmt(t.views)}</td><td>{fmt(t.visitors)}</td><td><b>{fmt(t.engagements)}</b></td>
                <td>{fmt(t.contacts)}</td><td>{fmt(t.channels)}</td><td>{fmt(t.forms)}</td><td>{fmt(t.attempts)}</td><td>{fmt(t.lookups)}</td>
                <td className="a-row-actions"><a href={`/t/${t.slug}/admin/analytics`}>التفاصيل</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
