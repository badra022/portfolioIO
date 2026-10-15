/**
 * Referral partners in the browser (content.referrals): a visitor who opens a
 * link with ?ref=<code> is credited to that partner for REF_DAYS, so a request,
 * quiz or vote they send later (even on another visit) counts for the partner.
 * Only the code and the time are kept on the device.
 */
export const REF_DAYS = 30;
export const REF_PARAM = "ref";
/** On a link to the home page, opens this form right away (components/LeadForms.tsx). */
export const FORM_PARAM = "form";

const key = (slug: string) => `ref:${slug}`;

export function rememberRef(slug: string, code: string): void {
  try { localStorage.setItem(key(slug), JSON.stringify({ c: code, at: Date.now() })); } catch { /* storage blocked */ }
}

/** The partner this visitor came through, if within REF_DAYS. */
export function currentRef(slug: string): string | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(key(slug)) ?? "null") as { c?: unknown; at?: unknown } | null;
    if (v && typeof v.c === "string" && typeof v.at === "number" && Date.now() - v.at < REF_DAYS * 86_400_000) return v.c;
  } catch { /* storage blocked */ }
  return undefined;
}

/** First time this device came through this partner's link to this page (for unique visitors). */
export function firstRefVisit(slug: string, code: string, page: string): boolean {
  const k = `ref:${slug}:seen`;
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(k) ?? "[]");
    const id = `${code}|${page}`;
    if (seen.includes(id)) return false;
    localStorage.setItem(k, JSON.stringify([...seen, id].slice(-200)));
    return true;
  } catch {
    return false;
  }
}

/** The page part of a link to share: "" (home), a quiz or vote path; with the partner's code (and a form to open). */
export function refLink(origin: string, base: string, code: string, page = "", form?: string): string {
  const q = new URLSearchParams({ [REF_PARAM]: code, ...(form ? { [FORM_PARAM]: form } : {}) });
  return `${origin}${base}/${page}?${q}`;
}
