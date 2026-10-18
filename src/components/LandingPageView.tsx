import type { Content, LandingPageT } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { asset } from "@/lib/assets";
import { youtubeId } from "@/lib/youtube";
import { ui } from "@/lib/i18n";
import { ActionButton } from "./ActionButton";
import { HideAfter } from "./HideAfter";
import { AfterDeadline } from "./AfterDeadline";
import { Icon } from "./Icon";
import { YoutubeVideo } from "./YoutubeVideo";
import { OfferCountdown } from "./OfferCountdown";

const VIDEO_FILE = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

/**
 * A teacher's page of its own (lib/schema.ts LandingPage): the video or image,
 * the title, description, points and price, one button, and the way back to the
 * site. After its end date the button gives way to a short "offer ended" line.
 */
export function LandingPageView({ page, c, chat, base }: { page: LandingPageT; c: Content; chat: ChatConfig; base: string }) {
  const t = ui(c.locale);
  const yt = page.video ? youtubeId(page.video) : null;
  const media = yt
    ? <YoutubeVideo id={yt} title={page.title} bare />
    : page.video && VIDEO_FILE.test(page.video) ? <video src={page.video} controls playsInline preload="metadata" poster={page.image ? asset(page.image) : undefined} />
    : page.image ? <img src={asset(page.image)} alt="" /> : null;
  return (
    <article className={`lp-card${media ? "" : " no-media"}`}>
      {media && <div className="lp-media">{media}</div>}
      {/* A link that isn't YouTube or a video file: a button to watch it there. */}
      {page.video && !yt && !VIDEO_FILE.test(page.video) && (
        <a className="btn btn-ghost lp-watch" href={page.video} target="_blank" rel="noopener noreferrer"><Icon name="play" />{t.pageVideo}</a>
      )}
      <div className="lp-body">
        {page.badge && <span className="ft-badge"><Icon name="bolt" />{page.badge}</span>}
        <h1>{page.title}</h1>
        {page.description && <p className="lp-text">{page.description}</p>}
        {page.points.some((p) => p.trim()) && (
          <ul className="ft-points">
            {page.points.filter((p) => p.trim()).map((p, i) => <li key={i}><Icon name="check" />{p}</li>)}
          </ul>
        )}
        {(page.price || page.oldPrice) && (
          <div className="ft-price">
            {page.price && <b className="num">{page.price}</b>}
            {page.oldPrice && <s className="num">{page.oldPrice}</s>}
            {page.priceNote && <small>{page.priceNote}</small>}
          </div>
        )}
        {/* Decided in the browser, so a cached page still stops on time. */}
        <HideAfter until={page.endsAt}>
          {page.countdown && page.endsAt && <OfferCountdown until={page.endsAt} />}
          <div className="lp-actions"><ActionButton action={page.cta} chat={chat} block /></div>
        </HideAfter>
        {page.endsAt && <AfterDeadline at={page.endsAt}><p className="lp-ended">{t.pageEnded}</p></AfterDeadline>}
        <a className="lp-back" href={`${base}/`}><Icon name="arrow" />{page.backLabel}</a>
      </div>
    </article>
  );
}
