import { BRAND, DEVELOPER } from "@/lib/platform";
import { OstazLogo } from "./brand/OstazLogo";
import { Icon } from "./Icon";

/** The platform's signature: a quiet strip under the footer, separate from the teacher's content. */
export function DevCredit({ siteName }: { siteName: string }) {
  const text = encodeURIComponent(DEVELOPER.message.replace("{site}", siteName));
  return (
    <div className="devcredit" dir="ltr" lang="en">
      <div className="wrap">
        <span className="dev-made">Made with <OstazLogo size={20} href={BRAND.home} /></span>
        {DEVELOPER.email && (
          <a className="dev-wa" href={`mailto:${DEVELOPER.email}`}>
            <Icon name="mail" />
            <span>{DEVELOPER.email}</span>
          </a>
        )}
        <a className="dev-wa" href={DEVELOPER.facebook} target="_blank" rel="noopener noreferrer">
          <Icon name="facebook" />
          <span>Facebook</span>
        </a>
        <a className="dev-wa" href={`https://wa.me/${DEVELOPER.whatsapp}?text=${text}`} target="_blank" rel="noopener noreferrer">
          <Icon name="whatsapp" />
          <span className="num">{DEVELOPER.phoneDisplay}</span>
        </a>
      </div>
    </div>
  );
}
