import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { asset } from "@/lib/assets";
import { ChatButton } from "./ChatButton";
import { MenuButton } from "./SectionMenu";
import { ui } from "@/lib/i18n";

export function Nav({ c, chat, menu }: { c: Content; chat: ChatConfig; menu: boolean }) {
  const logo = (
    <a className="logo" href="#top" aria-label={c.profile.fullTitle}>
      {c.profile.logo
        ? <img src={asset(c.profile.logo)} alt={c.profile.fullTitle} width={84} height={48} />
        : <span className="logo-text">{c.profile.fullTitle}</span>}
    </a>
  );
  const cta = <ChatButton chat={chat} size="sm" label={c.navCta.label} message={c.navCta.message} refCode={c.navCta.ref} form={c.navCta.form} />;
  // With the sections menu: its button on the start side (right in Arabic), the logo at the other end.
  if (menu) {
    return (
      <header className="nav has-menu">
        <div className="wrap">
          <MenuButton />
          <div className="nav-end">{cta}{logo}</div>
        </div>
      </header>
    );
  }
  return (
    <header className="nav">
      <div className="wrap">
        {logo}
        {c.nav.length > 0 && (
          <nav className="nav-links" aria-label={ui(c.locale).pageSections}>
            {c.nav.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
          </nav>
        )}
        {cta}
      </div>
    </header>
  );
}
