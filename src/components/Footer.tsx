import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { asset } from "@/lib/assets";
import { ChatButton } from "./ChatButton";
import { Socials } from "./Socials";

export function Footer({ c }: { c: Content }) {
  return (
    <footer className="footer">
      <div className="wrap">
        <div>{c.profile.fullTitle}{c.profile.latinName && <> · <span dir="ltr">{c.profile.latinName}</span></>}</div>
        {c.footer.hashtags.length > 0 && <div className="hash">{c.footer.hashtags.map((h) => <span key={h}>{h}</span>)}</div>}
        <Socials items={c.socials} iconOnly />
      </div>
    </footer>
  );
}

export function StickyBar({ c, chat }: { c: Content; chat: ChatConfig }) {
  return (
    <div className="sticky">
      <div className="wrap">
        <div className="who">
          {c.profile.avatar && <img src={asset(c.profile.avatar)} alt="" width={40} height={40} />}
          <div><b>{c.profile.fullTitle}</b>{c.profile.replyNote && <span>{c.profile.replyNote}</span>}</div>
        </div>
        <div className="acts">
          {c.sticky.secondary && <a className="btn btn-ghost btn-sm" href={c.sticky.secondary.href}>{c.sticky.secondary.label}</a>}
          <ChatButton chat={chat} size="sm" label={c.sticky.cta.label} message={c.sticky.cta.message} refCode={c.sticky.cta.ref} form={c.sticky.cta.form} />
        </div>
      </div>
    </div>
  );
}
