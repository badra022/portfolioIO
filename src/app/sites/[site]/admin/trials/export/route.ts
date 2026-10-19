import { connection } from "next/server";
import { requireSuper } from "@/lib/server/auth";
import { listTrialRequests } from "@/lib/server/repo";
import { listPartners } from "@/lib/server/partners";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Trial requests as a CSV for Excel (UTF-8 with BOM so Arabic shows). Super admin only. ?partner=<slug> keeps one partner's. */
export async function GET(req: Request, ctx: RouteContext<"/sites/[site]/admin/trials/export">) {
  await connection();
  const site = decodeURIComponent((await ctx.params).site);
  if (site !== "_platform") return new Response("Not found", { status: 404 });
  try { await requireSuper(site); } catch { return new Response("Forbidden", { status: 403 }); }
  const [all, partners] = await Promise.all([listTrialRequests(5000), listPartners()]);
  const name = new Map(partners.map((p) => [p.id, p]));
  const only = new URL(req.url).searchParams.get("partner");
  const onlyId = only ? partners.find((p) => p.slug === only)?.id ?? "-" : null;
  const rows = onlyId ? all.filter((r) => r.partnerId === onlyId) : all;
  // The partners' extra questions, each as its own column.
  const extraKeys = [...new Set(rows.flatMap((r) => Object.keys(r.extra ?? {})))];
  const head = ["date", "source", "name", "subject", "whatsapp", "address", "username", "language", "site state", "trial ends", "notes", ...extraKeys];
  const lines = rows.map((r) => [
    r.createdAt, r.partnerId ? name.get(r.partnerId)?.name ?? "deleted partner" : "myostaz.com", r.name, r.subject, r.phone ? `+${r.phone}` : "", r.slug, r.username, r.locale,
    !r.tenant ? "deleted" : r.tenant.status !== "active" ? "off" : r.tenant.trialEndsAt ? "trial" : "activated",
    r.tenant?.trialEndsAt ?? "", r.notes, ...extraKeys.map((k) => r.extra?.[k] ?? ""),
  ].map(cell).join(","));
  return new Response(`﻿${[head.join(","), ...lines].join("\r\n")}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="trial-requests.csv"`, "Cache-Control": "no-store" },
  });
}
