/** What the super admin can do to one or more teachers at once (admin/actions.ts tenantsAction). */
export const TENANT_ACTIONS = ["enable", "disable", "extend", "end", "activate", "delete"] as const;
export type TenantActionT = (typeof TENANT_ACTIONS)[number];

export const TENANT_ACTION_LABEL: Record<TenantActionT, string> = {
  enable: "تشغيل الموقع",
  disable: "إيقاف الموقع",
  extend: "مدّ التجربة 24 ساعة",
  end: "إنهاء التجربة الآن",
  activate: "تفعيل (موقع عادي)",
  delete: "حذف نهائي",
};

/** A teacher's state, as the console shows it. */
export type TenantState = "live" | "trial" | "trialOver" | "off";

export function tenantState(t: { status: string; trialEndsAt: string | null }, now = Date.now()): TenantState {
  if (t.status !== "active") return "off";
  if (t.trialEndsAt) return Date.parse(t.trialEndsAt) > now ? "trial" : "trialOver";
  return "live";
}

export const STATE_LABEL: Record<TenantState, string> = { live: "شغال", trial: "تجربة شغالة", trialOver: "تجربة انتهت", off: "متوقف" };

/** Arabic counted nouns: 1 ساعة, 2 ساعتين, 3-10 ساعات, 11+ ساعة. */
const counted = (n: number, [one, two, few]: [string, string, string]) =>
  n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${one}`;

/** «من 3 ساعات», «باقي 5 ساعات»: a short distance to now. */
export function fromNow(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso) - now;
  const m = Math.round(Math.abs(ms) / 60_000);
  if (m < 1) return "دلوقتي";
  const text = m < 60 ? counted(m, ["دقيقة", "دقيقتين", "دقايق"])
    : m < 48 * 60 ? counted(Math.round(m / 60), ["ساعة", "ساعتين", "ساعات"])
    : counted(Math.round(m / 1440), ["يوم", "يومين", "أيام"]);
  return ms < 0 ? `من ${text}` : `باقي ${text}`;
}
