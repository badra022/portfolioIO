import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { asset } from "@/lib/assets";
import { ChatButton } from "./ChatButton";

export function Nav({ c, chat }: { c: Content; chat: ChatConfig }) {
  return (
    <header className="nav">
      <div className="wrap">
        <a className="logo" href="#top" aria-label={c.profile.fullTitle}>
          {c.profile.logo
            ? <img src={asset(c.profile.logo)} alt={c.profile.fullTitle} width={84} height={48} />
            : <span className="logo-text">{c.profile.fullTitle}</span>}
        </a>
        {c.nav.length > 0 && (
          <nav className="nav-links" aria-label="أقسام الصفحة">
            {c.nav.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
          </nav>
        )}
        <ChatButton chat={chat} size="sm" label={c.navCta.label} message={c.navCta.message} refCode={c.navCta.ref} form={c.navCta.form} />
      </div>
    </header>
  );
}
