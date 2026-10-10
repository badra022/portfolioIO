import "server-only";
import { cookies } from "next/headers";
import { ENV_COOKIE, isEnv, type SiteEnv } from "@/lib/environments";

/** The environment the admin panel shows data for (switch at the top of every admin page). Production unless switched. */
export async function adminEnv(): Promise<SiteEnv> {
  const v = (await cookies()).get(ENV_COOKIE)?.value;
  return isEnv(v) ? v : "production";
}
