import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireSuper } from "@/lib/server/auth";
import { consoleData } from "@/lib/server/console";
import { listBundled } from "@/lib/server/bundled";
import { importBundledAction } from "../actions";
import { TenantsTable } from "@/components/admin/TenantsTable";
import { ActionForm } from "@/components/admin/ConsoleForms";

export const metadata: Metadata = { title: "المدرسين" };

/** Super admin, platform host: every teacher with their state, and actions on one or many. */
export default async function Tenants({ params }: PageProps<"/sites/[site]/admin/tenants">) {
  const site = decodeURIComponent((await params).site);
  if (site !== "_platform") notFound();
  await requireSuper(site);
  await connection();
  const { rows } = await consoleData();
  const bundled = listBundled();
  return (
    <>
      <div className="a-head">
        <h1>المدرسين</h1>
        <p className="a-sub">كل المواقع وحالتها. اضغط على أي مدرس تفتح صفحته، أو حدد كذا مدرس وطبّق إجراء على الكل.</p>
        <div className="a-actions"><a className="btn-sm primary" href="/admin/tenants/new">+ مدرس جديد</a></div>
      </div>
      <TenantsTable rows={rows} now={Date.now()} />
      <details className="a-panel sa-tools">
        <summary>استيراد من المستودع</summary>
        <p className="a-sub">ينسخ المدرسين من مجلد <code>tenants/</code> ({bundled.join("، ") || "لا يوجد"}) إلى قاعدة البيانات، ويرفع صورهم إلى التخزين.</p>
        <ActionForm action={importBundledAction} submit="استيراد">
          <label className="f-check"><input type="checkbox" name="overwrite" /> استبدال بيانات المدرسين الموجودين بالفعل</label>
        </ActionForm>
      </details>
    </>
  );
}
