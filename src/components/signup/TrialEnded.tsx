import "./signup.css";
import { BRAND } from "@/lib/platform";
import { OstazLogo } from "../brand/OstazLogo";
import { DevCredit } from "../DevCredit";

/** A free trial site after its 24 hours (lib/server/site.ts kind "ended"). */
export function TrialEnded({ locale, name }: { locale: string; name: string }) {
  const en = locale === "en";
  return (
    <main className="su su-ended" lang={en ? "en" : "ar"} dir={en ? "ltr" : "rtl"}>
      <div className="su-card">
        <OstazLogo size={34} href={BRAND.home} />
        <span className="su-badge">{en ? "Trial ended" : "الفترة التجريبية انتهت"}</span>
        <h1>{name}</h1>
        <p>{en ? "This site was a 24-hour free trial and is paused now. Contact us to activate it: everything you set up is kept." : "الموقع ده كان تجربة مجانية لمدة 24 ساعة ووقف دلوقتي. كلمنا نفعّله ليك، وكل اللي عملته محفوظ."}</p>
      </div>
      <DevCredit siteName={name} />
    </main>
  );
}
