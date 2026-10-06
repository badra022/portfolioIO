import { DEVELOPER } from "@/lib/platform";
import { Icon } from "./Icon";

/** The developer's signature: a quiet strip under the footer, separate from the teacher's content. */
export function DevCredit({ siteName }: { siteName: string }) {
  const text = encodeURIComponent(DEVELOPER.message.replace("{site}", siteName));
  return (
    <div className="devcredit" dir="ltr" lang="en">
      <div className="wrap">
        <span>Developed by <b>{DEVELOPER.name}</b></span>
        <a href={`mailto:${DEVELOPER.email}`}>{DEVELOPER.email}</a>
        <a className="dev-wa" href={`https://wa.me/${DEVELOPER.whatsapp}?text=${text}`} target="_blank" rel="noopener noreferrer">
          <Icon name="whatsapp" />
          <span className="num">{DEVELOPER.phoneDisplay}</span>
        </a>
      </div>
    </div>
  );
}
