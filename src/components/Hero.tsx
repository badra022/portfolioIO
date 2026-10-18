import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { asset } from "@/lib/assets";
import { ChatButton } from "./ChatButton";
import { Rich } from "./Rich";
import { Socials } from "./Socials";

/** A photo whose background was removed (lib/cutout.ts names those files "...cutout..."). */
export const isCutout = (photo: string | undefined | null) => Boolean(photo && /cutout/i.test(photo));

export function Hero({ c, chat }: { c: Content; chat: ChatConfig }) {
  const h = c.hero;
  const cut = isCutout(c.profile.photo);
  return (
    <section className="hero" id="top">
      <div className="wrap">
        <div className="hero-copy">
          <p className="kicker">{h.kicker}</p>
          <h1>
            {h.headline.map((line, i) => (
              <span className="line" key={i}><Rich value={line} /></span>
            ))}
          </h1>
          <p className="lede"><Rich value={h.lede} /></p>
          <div className="cta-row">
            <ChatButton chat={chat} label={h.primaryCta.label} message={h.primaryCta.message} refCode={h.primaryCta.ref} form={h.primaryCta.form} />
            {h.secondaryCta && <a className="btn btn-ghost" href={h.secondaryCta.href}>{h.secondaryCta.label}</a>}
          </div>
          {h.stats.length > 0 && (
            <div className="stats">
              {h.stats.map((s) => (
                <div className="stat" key={s.label}>
                  <b className="num">{s.prefix && <i>{s.prefix}</i>}{s.value}</b>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}
          <Socials items={c.socials} />
        </div>
        <div className={cut ? "hero-photo cut" : "hero-photo"}>
          {/* The teacher on the site's own colors: a shape behind a background-free photo, a tinted frame around any other. */}
          <span className="hero-backdrop" aria-hidden="true" />
          <img src={asset(c.profile.photo)} alt={c.profile.fullTitle} width={cut ? 700 : 820} height={cut ? 820 : 661} fetchPriority="high" />
          {c.profile.photoBadge && <span className="badge">{c.profile.photoBadge}</span>}
        </div>
      </div>
    </section>
  );
}
