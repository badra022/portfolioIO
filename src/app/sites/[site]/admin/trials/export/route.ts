import { connection } from "next/server";
import { requireSuper } from "@/lib/server/auth";
import { listTrialRequests } from "@/lib/server/repo";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Trial requests as a CSV for Excel (UTF-8 with BOM so Arabic shows). Super admin only. */
export async function GET(_req: Request, ctx: RouteContext<"/sites/[site]/admin/trials/export">) {
  await connection();
  const site = decodeURIComponent((await ctx.params).site);
  if (site !== "_platform") return new Response("Not found", { status: 404 });
  try { await requireSuper(site); } catch { return new Response("Forbidden", { status: 403 }); }
  const rows = await listTrialRequests(5000);
  const head = ["date", "name", "subject", "whatsapp", "address", "username", "language", "site state", "trial ends", "notes"];
  const lines = rows.map((r) => [
    r.createdAt, r.name, r.subject, r.phone ? `+${r.phone}` : "", r.slug, r.username, r.locale,
    !r.tenant ? "deleted" : r.tenant.status !== "active" ? "off" : r.tenant.trialEndsAt ? "trial" : "activated",
    r.tenant?.trialEndsAt ?? "", r.notes,
  ].map(cell).join(","));
  return new Response(`﻿${[head.join(","), ...lines].join("\r\n")}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="trial-requests.csv"`, "Cache-Control": "no-store" },
  });
}
