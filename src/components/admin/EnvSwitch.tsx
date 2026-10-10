"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ENV_COOKIE, ENV_LABEL, ENVS, type SiteEnv } from "@/lib/environments";

/**
 * The environment the admin pages show data for: requests, quiz results, exam
 * results and analytics of the public site or of the private preview. Kept in a
 * cookie so it stays while moving between pages.
 */
export function EnvSwitch({ env, previewUrl }: { env: SiteEnv; previewUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <span className={`a-env ${env}`}>
      <select
        aria-label="البيئة"
        value={env}
        disabled={pending}
        onChange={(e) => {
          document.cookie = `${ENV_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          start(() => router.refresh());
        }}
      >
        {ENVS.map((k) => <option key={k} value={k}>{ENV_LABEL[k]}</option>)}
      </select>
      {env === "preview" && <a href={previewUrl} target="_blank" rel="noopener">فتح المعاينة ↗</a>}
    </span>
  );
}
