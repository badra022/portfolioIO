"use client";
import { useEffect, useState } from "react";
import { IGNORE_KEY } from "@/components/Tracker";

/**
 * Browsers that open /admin are left out of the numbers. This shows whether the
 * current one is, and lets its owner switch (useful for testing the counters).
 */
export function CountThisBrowser() {
  const [counted, setCounted] = useState<boolean | null>(null);
  useEffect(() => {
    try { setCounted(localStorage.getItem(IGNORE_KEY) === "count"); } catch { setCounted(null); }
  }, []);
  if (counted === null) return null;
  const set = (count: boolean) => {
    try { localStorage.setItem(IGNORE_KEY, count ? "count" : "1"); setCounted(count); } catch { /* ignore */ }
  };
  return (
    <div className="an-self">
      {counted ? (
        <span>زياراتك من المتصفح ده <b>بتتحسب</b> في الأرقام.</span>
      ) : (
        <span>زياراتك من المتصفح ده <b>مش بتتحسب</b> عشان فتحت منه لوحة التحكم (عشان متكبّرش الأرقام).</span>
      )}
      <button type="button" className="btn-sm ghost" onClick={() => set(!counted)}>
        {counted ? "متحسبش زياراتي" : "احسب زياراتي (للتجربة)"}
      </button>
    </div>
  );
}
