import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { checkUploadLink } from "@/lib/server/upload-link";
import { Uploader } from "@/components/admin/Uploader";
import "../admin/admin.css";

export const metadata: Metadata = { title: "رفع صور", robots: { index: false, follow: false } };

/** Photo drop page for a signed link from the MCP server. Only on the platform host. */
export default function UploadPage({ params, searchParams }: PageProps<"/sites/[site]/upload">) {
  return (
    <div className="admin" lang="ar" dir="rtl">
      <main className="a-main">
        <Suspense fallback={<p className="a-loading">جاري التحميل…</p>}>
          <Body params={params} searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function Body({ params, searchParams }: Pick<PageProps<"/sites/[site]/upload">, "params" | "searchParams">) {
  await connection();
  const site = decodeURIComponent((await params).site);
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const slug = site === "_platform" ? checkUploadLink(one(q.t), one(q.e), one(q.s)) : null;
  if (!slug) return <div className="a-alert">الرابط غير صالح أو انتهت صلاحيته. اطلب رابط جديد من Claude.</div>;
  return (
    <>
      <div className="a-head">
        <h1>رفع صور للمدرس <code dir="ltr">{slug}</code></h1>
        <p className="a-sub">اختار الصور (أو اسحبها هنا). بعد الرفع ارجع للمحادثة وقول إنك خلصت، وClaude هيشوفها ويحطها في أماكنها. اسم كل صورة بيساعد: مثلاً teacher.jpg أو book-cover.jpg.</p>
      </div>
      <Uploader slug={slug} exp={one(q.e)!} sig={one(q.s)!} />
    </>
  );
}
