import { baseForSite } from "@/lib/routing";
import { SECTIONS, sectionById } from "@/lib/admin/sections";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { getTenant } from "@/lib/server/repo";
import { PlatformConsole } from "@/components/admin/PlatformConsole";
import { formatWhen } from "@/lib/admin/format";
import { adminCounts } from "@/lib/server/admin-counts";
import { report } from "@/lib/server/analytics";
import { adminEnv } from "@/lib/server/admin-env";
import { FEATURES, FEATURE_INFO } from "@/lib/permissions";
import { PREVIEW_PATH } from "@/lib/environments";
import { sameJson } from "@/lib/content-utils";
import { SectionKey } from "@/lib/schema";
import { PreviewPanel } from "@/components/admin/PreviewPanel";
import { Icon } from "@/components/Icon";

const n = (v: number) => v.toLocaleString("en-US");
const cairoDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(d);

function greeting(now: Date): string {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Cairo" }).format(now));
  return h < 12 ? "صباح الخير" : "مساء الخير";
}

/** «بعد 3 أيام» for an exam date (YYYY-MM-DD...). */
function inDays(date: string, now: Date): string {
  const days = Math.round((Date.parse(date.slice(0, 10)) - Date.parse(cairoDay(now))) / 86_400_000);
  if (days <= 0) return "النهاردة";
  if (days === 1) return "بكرة";
  if (days === 2) return "بعد يومين";
  return days <= 10 ? `بعد ${days} أيام` : `بعد ${days} يوم`;
}

export default async function AdminHome({ params }: PageProps<"/sites/[site]/admin">) {
  const site = decodeURIComponent((await params).site);
  await requireAdmin(site);
  if (site === "_platform") return <PlatformConsole />;

  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  if (!t || !slug) return <p>لا يوجد مدرس على هذا العنوان.</p>;
  const base = baseForSite(site);
  const admin = `${base}/admin`;
  const env = await adminEnv();
  const now = new Date();
  const [counts, month] = await Promise.all([
    adminCounts(t, env),
    t.permissions.analytics ? report(slug, "month", env).catch(() => null) : null,
  ]);
  const missing = FEATURES.filter((f) => !t.permissions[f]);
  // Editor pages whose preview differs from the public site.
  const changed = new Set(t.preview.pending ? SECTIONS.filter((s) => s.theme
    ? !sameJson(t.preview.theme, t.theme)
    : (s.keys ?? []).some((k) => !sameJson((t.preview.content as Record<string, unknown>)[k], (t.content as Record<string, unknown>)[k]))).map((s) => s.id) : []);

  const content = env === "preview" ? t.preview.content : t.content;
  const today = cairoDay(now);
  const nextExam = (content.exams?.items ?? []).filter((e) => e.date.slice(0, 10) >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const finished = Object.values(counts.perQuiz).reduce((s, q) => s + q.finished, 0);

  const shown = t.content.sections;
  const hidden = SectionKey.options.filter((k) => !shown.includes(k));
  const first = t.content.profile.name || t.name;

  const todo: { href: string; icon: string; tone?: string; title: string; sub: string }[] = [];
  if (counts.requests > 0) todo.push({ href: `${admin}/requests`, icon: "chat", title: counts.requests === 1 ? "طلب جديد" : `${n(counts.requests)} طلبات جديدة`, sub: "ردّ عليهم بضغطة واتساب" });
  if (counts.grading > 0) todo.push({ href: counts.toGrade.length === 1 ? `${admin}/quizzes/${counts.toGrade[0].path}` : `${admin}/quizzes`, icon: "check", tone: "amber", title: counts.grading === 1 ? "إجابة محتاجة تصحيح" : `${n(counts.grading)} إجابات محتاجة تصحيح`, sub: counts.toGrade.map((q) => q.title).join("، ") });
  if (counts.complaints > 0) todo.push({ href: `${admin}/complaints`, icon: "megaphone", tone: "amber", title: counts.complaints === 1 ? "شكوى أو اقتراح جديد" : `${n(counts.complaints)} شكاوى واقتراحات جديدة`, sub: "من غير أسماء، اقراها وشوف تعمل إيه" });
  if (nextExam) todo.push({ href: `${admin}/edit/exams`, icon: "calendar", tone: "deep", title: `${nextExam.title}: ${inDays(nextExam.date, now)}`, sub: "راجع البيانات والجايزة قبل الامتحان" });

  const quick = [
    { href: `${admin}/edit/schedule`, icon: "calendar", label: "ميعاد" },
    { href: `${admin}/edit/exams`, icon: "trophy", label: "امتحان" },
    { href: `${admin}/edit/quizzes`, icon: "check", label: "اختبار" },
    { href: `${admin}/edit/polls`, icon: "chat", label: "تصويت" },
    { href: `${admin}/edit/popup`, icon: "megaphone", label: "إعلان" },
  ];

  return (
    <div className="hm">
      <div className="hm-hello">
        <h1>{greeting(now)} يا {first}</h1>
        <p className="a-sub">
          {t.updatedAt ? <>آخر نشر {formatWhen(t.updatedAt)}{t.updatedBy && <> بواسطة {t.updatedBy}</>}</> : "ابدأ بتجهيز موقعك من القائمة."}
        </p>
      </div>

      {(missing.length > 0 || t.permissions.maxForms !== null) && (
        <p className="a-envnote">
          {missing.length > 0 && <>مش في باقة الموقع: {missing.map((f) => FEATURE_INFO[f].title).join("، ")}. تقدر تجهّزها في المعاينة، لكن النشر على الموقع محتاج تفعيلها من الإدارة. </>}
          {t.permissions.maxForms !== null && <>الحد الأقصى للنماذج: {t.permissions.maxForms}.</>}
        </p>
      )}

      {changed.size > 0 && (
        <PreviewPanel
          site={site}
          previewUrl={`${base}${PREVIEW_PATH}/`}
          by={t.preview.updatedBy}
          at={t.preview.updatedAt ? formatWhen(t.preview.updatedAt) : null}
          sections={SECTIONS.filter((s) => changed.has(s.id)).map((s) => ({ id: s.id, title: s.title, href: `${admin}/edit/${s.id}` }))}
        />
      )}

      <section aria-labelledby="hm-todo-h">
        <h2 id="hm-todo-h" className="hm-h">محتاج منك النهاردة</h2>
        {todo.length > 0 ? (
          <ul className="hm-todo">
            {todo.map((c) => (
              <li key={c.href + c.title}>
                <a href={c.href}>
                  <span className={`hm-ico ${c.tone ?? ""}`}><Icon name={c.icon} /></span>
                  <span className="hm-todo-text"><b>{c.title}</b>{c.sub && <small>{c.sub}</small>}</span>
                  <i className="hm-go" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hm-done"><span className="hm-ico ok"><Icon name="check" /></span>كله تمام: مفيش طلبات ولا إجابات مستنياك.</p>
        )}
      </section>

      <section aria-label="أرقام الشهر" className="hm-stats">
        {month && <a href={`${admin}/analytics`} className="hm-stat"><span>زوار الشهر</span><b>{n(month.visitors)}</b></a>}
        {month && <a href={`${admin}/analytics`} className="hm-stat"><span>تواصلوا معاك</span><b>{n(month.converted.contact)}</b></a>}
        {t.permissions.forms && <a href={`${admin}/requests`} className="hm-stat"><span>طلبات جديدة</span><b>{n(counts.requests)}</b></a>}
        <a href={`${admin}/quizzes`} className="hm-stat"><span>إجابات اختبارات</span><b>{n(finished)}</b></a>
      </section>

      <section aria-labelledby="hm-quick-h">
        <h2 id="hm-quick-h" className="hm-h">إضافة سريعة</h2>
        <ul className="hm-quick">
          {quick.map((q) => (
            <li key={q.href}><a href={q.href}><span className="hm-ico big"><Icon name={q.icon} /></span>{q.label}</a></li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="hm-sec-h">
        <div className="hm-h-row">
          <h2 id="hm-sec-h" className="hm-h">أقسام موقعك</h2>
          <a href={`${admin}/edit/layout`} className="f-link">رتّب أو اخفي أقسام</a>
        </div>
        <ul className="hm-sections">
          {[...shown, ...hidden].map((key) => {
            const def = sectionById(key);
            if (!def) return null;
            const state = changed.has(key) ? "draft" : shown.includes(key) ? "on" : "off";
            return (
              <li key={key}>
                <a href={`${admin}/edit/${key}`}>
                  <span className="hm-sec-text"><b>{def.title}</b><small>{def.description}</small></span>
                  <span className={`st-chip ${state}`}>{state === "draft" ? "مش منشور" : state === "on" ? "ظاهر" : "مخفي"}</span>
                  <i className="hm-go" aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
