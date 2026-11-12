import type { Metadata } from "next";
import { REVISION_DAYS } from "@/lib/server/repo";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { isPlatformHost, normalizeHost } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { CopyText } from "@/components/CopyText";

export const metadata: Metadata = { title: "ربط Claude" };

/**
 * How a teacher links an AI app (Claude, or any app that takes custom MCP connectors) to
 * their own site: the connector address, then signing in with this admin's own login
 * (OAuth, lib/server/oauth.ts). The connection reaches this site only, without the tools
 * the admin panel keeps for the platform (theme, logins, domains: lib/server/mcp/server.ts).
 */
export default async function ConnectClaude({ params }: PageProps<"/sites/[site]/admin/claude">) {
  const site = decodeURIComponent((await params).site);
  await requireAdmin(site);
  if (!(await slugForSite(site))) notFound();
  // The connector lives on the platform's address (myostaz.com), not on the teacher's domain.
  const h = await headers();
  const host = normalizeHost(h.get("x-forwarded-host") ?? h.get("host"));
  const proto = h.get("x-forwarded-proto") ?? (host === "localhost" || host.startsWith("127.") ? "http" : "https");
  const port = (h.get("x-forwarded-host") ?? h.get("host") ?? "").match(/:\d+$/)?.[0] ?? "";
  const platform = isPlatformHost(host, env.rootDomain, env.platformHosts) ? `${proto}://${host}${port}` : env.rootDomain ? `https://${env.rootDomain}` : null;

  return (
    <>
      <div className="a-head">
        <h1>إدارة موقعك من Claude</h1>
        <p className="a-sub">اربط Claude (أو أي تطبيق ذكاء اصطناعي بيقبل custom connectors) بموقعك مرة واحدة، وبعدها اطلب منه بالكلام: يعدّل المواعيد، يضيف عرض أو إعلان، يعمل اختبار ويصححه، يرد على الطلبات، أو يقولك الأرقام. بيوصل لموقعك إنت بس.</p>
      </div>
      {!platform ? <p className="a-sub">الربط مش متاح على العنوان ده. كلم إدارة myostaz.</p> : (
        <ol className="a-steps">
          <li><b>افتح الإعدادات في Claude</b><span>على claude.ai أو تطبيق الكمبيوتر أو الموبايل: <em>Settings</em> ← <em>Connectors</em> ← <em>Add custom connector</em>.</span></li>
          <li><b>حط الاسم والرابط</b><span>الاسم: <code dir="ltr">myostaz</code> · الرابط:</span><CopyText text={`${platform}/api/mcp`} /></li>
          <li><b>اضغط Connect وسجّل دخولك</b><span>هتفتح صفحة myostaz.com: ادخل بنفس اسم المستخدم وكلمة السر اللي بتدخل بيهم على لوحة التحكم دي، ثم اضغط «اسمح». مش محتاج أي كود أو مفتاح.</span></li>
          <li><b>ابدأ اطلب</b><span>مثلاً: «غيّر ميعاد مجموعة السبت لـ 5 العصر»، «حط إعلان عن امتحان الشهر»، «اعمل اختبار 10 أسئلة على الباب الأول»، «صحّح الاختبار وابعت لكل طالب ملاحظة»، «مين طلب يحجز النهاردة؟».</span></li>
        </ol>
      )}
      <p className="a-sub">كل تعديل بيعمله Claude بيتسجل باسمك إنت في <a className="f-link" href="history">سجل التعديلات</a>، وتقدر ترجّعه خلال {REVISION_DAYS} أيام. التعديلات بتتحفظ في المعاينة الأول، ومش بتظهر للطلاب غير لما توافق على النشر.</p>
      <p className="a-sub">ألوان الموقع وخطوطه، الحسابات، والدومين بتتعمل من إدارة myostaz. لو غيّرت كلمة السر أو عايز تفصل Claude: من نفس صفحة Connectors اضغط Disconnect.</p>
    </>
  );
}
