import { FEATURE_INFO, blockedMessage, type Feature } from "@/lib/permissions";

/** Shown instead of a page that's outside the site's plan (lib/permissions.ts). */
export function PlanBlocked({ feature, back }: { feature: Feature; back: string }) {
  return (
    <>
      <div className="a-head">
        <a className="a-back" href={back}>→ الرئيسية</a>
        <h1>{FEATURE_INFO[feature].title}</h1>
      </div>
      <div className="a-panel plan-blocked" role="alert">
        <b>🔒 {blockedMessage(feature)}</b>
        <p className="a-sub">{FEATURE_INFO[feature].description}</p>
      </div>
    </>
  );
}
