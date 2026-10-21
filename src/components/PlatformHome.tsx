import { headers } from "next/headers";
import { connection } from "next/server";
import { sessionAccount } from "@/lib/server/auth";
import { PartnerHome } from "./PartnerHome";
import { MarketingHome } from "./landing/MarketingHome";

/**
 * What the platform's own domain shows at "/": a signed-in partner's own page (their
 * form, unlimited trials, their sites); everyone else the service's home page, with the
 * partners' login in its header. Sites are built through partners only.
 */
export async function PlatformHome() {
  await connection();
  const acct = await sessionAccount((await headers()).get("cookie")).catch(() => null);
  if (acct?.kind === "partner") return <PartnerHome slug={acct.partner.slug} />;
  return <MarketingHome isSuper={acct?.kind === "super"} year={new Date().getFullYear()} />;
}
