import { baseForSite } from "@/lib/routing";
import { SECTIONS } from "@/lib/admin/sections";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { getTenant } from "@/lib/server/repo";
import { PlatformConsole } from "@/components/admin/PlatformConsole";
import { formatWhen } from "@/lib/admin/format";
import { countNew } from "@/lib/server/submissions";
import { attemptCounts } from "@/lib/server/quiz-attempts";
import { adminEnv } from "@/lib/server/admin-env";
import { PREVIEW_PATH } from "@/lib/environments";
import { sameJson } from "@/lib/content-utils";
import { PreviewPanel } from "@/components/admin/PreviewPanel";

export default async function AdminHome({ params }: PageProps<"/sites/[site]/admin">) {
  const site = decodeURIComponent((await params).site);
  const p = await requireAdmin(site);
  if (site === "_platform") return <PlatformConsole />;

  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  if (!t) return <p>لا يوجد مدرس على هذا العنوان.</p>;
  const base = baseForSite(site);
  const env = await adminEnv();
  const [newRequests, quizCounts] = await Promise.all([countNew(slug!, env), attemptCounts(slug!, env)]);
  const sections = SECTIONS.filter((s) => !s.superOnly || p.kind === "super");
  // Editor pages whose preview differs from the public site.
  const changed = new Set(t.preview.pending ? SECTIONS.filter((s) => s.theme
    ? !sameJson(t.preview.theme, t.theme)
    : (s.keys ?? []).some((k) => !sameJson((t.preview.content as Record<string, unknown>)[k], (t.content as Record<string, unknown>)[k]))).map((s) => s.id) : []);
  const quizzes = (env === "preview" ? t.preview.content : t.content).quizzes;

  return (
    <>
      <div className="a-head">
        <h1>{t.name}</h1>
        <p className="a-sub">
          النسخة {t.version}
          {t.updatedAt && <> · آخر تعديل {formatWhen(t.updatedAt)}{t.updatedBy && <> بواسطة {t.updatedBy}</>}</>}
        </p>
        <div className="a-actions">
          <a className="btn-sm primary" href={`${base}${PREVIEW_PATH}/`} target="_blank" rel="noopener">عرض المعاينة ↗</a>
          <a className="btn-sm ghost" href={`${base}/`} target="_blank" rel="noopener">عرض الموقع ↗</a>
          <a className="btn-sm primary" href={`${base}/admin/requests`}>الطلبات{newRequests > 0 && <span className="a-count">{newRequests}</span>}</a>
          <a className="btn-sm primary" href={`${base}/admin/analytics`}>الإحصائيات</a>
          <a className="btn-sm primary" href={`${base}/admin/quizzes`}>الاختبارات</a>
          <a className="btn-sm primary" href={`${base}/admin/results`}>نتايج الامتحانات</a>
          <a className="btn-sm ghost" href={`${base}/admin/history`}>سجل التعديلات</a>
        </div>
      </div>
      {changed.size > 0 && (
        <PreviewPanel
          site={site}
          previewUrl={`${base}${PREVIEW_PATH}/`}
          by={t.preview.updatedBy}
          at={t.preview.updatedAt ? formatWhen(t.preview.updatedAt) : null}
          sections={SECTIONS.filter((s) => changed.has(s.id)).map((s) => ({ id: s.id, title: s.title, href: `${base}/admin/edit/${s.id}` }))}
        />
      )}
      {quizzes.length > 0 && (
        <>
          <h2 className="a-h2">الاختبارات</h2>
          <ul className="a-cards">
            {quizzes.map((q) => (
              <li key={q.path}>
                <a href={`${base}/admin/quizzes/${q.path}`}>
                  <strong>{q.title}</strong>
                  <span>{quizCounts[q.path]?.total ?? 0} بدأوا · {quizCounts[q.path]?.finished ?? 0} سلّموا · /{q.path}</span>
                </a>
              </li>
            ))}
          </ul>
          <h2 className="a-h2">المحتوى</h2>
        </>
      )}
      <ul className="a-cards">
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`${base}/admin/edit/${s.id}`}>
              <strong>{s.title}{changed.has(s.id) && <span className="a-chip">في المعاينة</span>}</strong>
              <span>{s.description}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
