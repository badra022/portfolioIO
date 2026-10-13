import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { asset } from "@/lib/assets";
import { youtubeId } from "@/lib/youtube";
import { ActionButton } from "./ActionButton";
import { SectionHead } from "./SectionHead";
import { HideAfter } from "./HideAfter";
import { Icon } from "./Icon";
import { YoutubeVideo } from "./YoutubeVideo";
import { OfferCountdown } from "./OfferCountdown";
import { Carousel } from "./Carousel";

type Data = NonNullable<Content["featured"]>;
type Item = Data["items"][number];

/**
 * The teacher's spotlight: offers, new courses, videos, announcements. Cards show
 * between their start and end dates (also checked in the browser), with a
 * countdown to the end when the teacher wants one.
 */
export function Featured({ data, chat }: { data: Data; chat: ChatConfig }) {
  if (!data.items.length) return null;
  // auto: the first card is the spotlight (full width), the others under it.
  const big = data.display === "auto";
  return (
    <section className="block" id="featured">
      <div className="wrap">
        <SectionHead eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
        {big ? (
          <div className={`ft-grid spotlight${data.items.length === 1 ? " single" : ""}`}>
            {data.items.map((it, i) => (
              <HideAfter key={it.title + i} from={it.startsAt} until={it.endsAt}>
                <Card it={it} chat={chat} wide={i === 0} />
              </HideAfter>
            ))}
          </div>
        ) : (
          <Carousel display={data.display} className="ft-grid" per={data.display === "list" ? 1 : 3} label={data.eyebrow}>
            {data.items.map((it, i) => (
              <HideAfter key={it.title + i} from={it.startsAt} until={it.endsAt}>
                <Card it={it} chat={chat} wide={data.display === "list"} />
              </HideAfter>
            ))}
          </Carousel>
        )}
      </div>
    </section>
  );
}

function Card({ it, chat, wide }: { it: Item; chat: ChatConfig; wide: boolean }) {
  const vid = it.video ? youtubeId(it.video) : null;
  const media = vid
    ? <div className="ft-media"><YoutubeVideo id={vid} title={it.title} bare /></div>
    : it.image ? <div className="ft-media"><img src={asset(it.image)} alt="" loading="lazy" /></div> : null;
  return (
    <article className={`ft-card${wide ? " wide" : ""}${media ? "" : " no-media"}`}>
      {media}
      <div className="ft-body">
        {it.badge && <span className="ft-badge"><Icon name="bolt" />{it.badge}</span>}
        <h3>{it.title}</h3>
        {it.text && <p className="ft-text">{it.text}</p>}
        {it.points.length > 0 && (
          <ul className="ft-points">
            {it.points.filter((p) => p.trim()).map((p, i) => <li key={i}><Icon name="check" />{p}</li>)}
          </ul>
        )}
        {(it.price || it.oldPrice) && (
          <div className="ft-price">
            {it.price && <b className="num">{it.price}</b>}
            {it.oldPrice && <s className="num">{it.oldPrice}</s>}
            {it.priceNote && <small>{it.priceNote}</small>}
          </div>
        )}
        {it.countdown && it.endsAt && <OfferCountdown until={it.endsAt} />}
        {(it.cta || it.secondaryCta) && (
          <div className="ft-actions">
            {it.cta && <ActionButton action={it.cta} chat={chat} />}
            {it.secondaryCta && <ActionButton action={it.secondaryCta} chat={chat} variant="ghost" />}
          </div>
        )}
      </div>
    </article>
  );
}
