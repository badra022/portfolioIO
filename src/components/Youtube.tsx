import type { Content, SocialT } from "@/lib/schema";
import { asset } from "@/lib/assets";
import { Icon } from "./Icon";
import { YoutubeVideo } from "./YoutubeVideo";
import { youtubeId } from "@/lib/youtube";
import { SectionHead } from "./SectionHead";

const sameUrl = (a: string, b: string) => a.replace(/\/+$/, "").toLowerCase() === b.replace(/\/+$/, "").toLowerCase();

export function Youtube({ data, avatar, socials }: { data: NonNullable<Content["youtube"]>; avatar?: string; socials: SocialT[] }) {
  const videos = data.videos.flatMap((v) => {
    const id = youtubeId(v.id);
    return id ? [{ ...v, id }] : [];
  });
  // The channel's own entry (if it's in the social list) feeds the channel card; the rest become cards below.
  const channel = socials.find((s) => sameUrl(s.url, data.channelUrl));
  const others = data.showSocials ? socials.filter((s) => s !== channel) : [];
  const showFollowers = data.showSocials && Boolean(data.followersTotal);

  return (
    <section className="block" id="youtube">
      <div className="wrap">
        <SectionHead eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
        {videos.length > 0 && (
          <div className="vids">
            {videos.map((v) => <YoutubeVideo key={v.id} id={v.id} title={v.title} caption={v.caption} />)}
          </div>
        )}
        <a className="yt-card" href={data.channelUrl} target="_blank" rel="noopener noreferrer">
          <span className="yt-id">
            {avatar && <img src={asset(avatar)} alt="" width={56} height={56} />}
            <span>
              <b>{data.channelName}</b>
              {channel?.note && <span className="yt-note">{channel.note}</span>}
              <small dir="ltr">{data.channelUrl.replace(/^https?:\/\/(www\.)?/, "")}</small>
            </span>
          </span>
          <span className="yt-side">
            {channel?.followers && <span className="yt-subs num" dir="ltr">{channel.followers}</span>}
            <span className="btn btn-wa btn-sm"><Icon name="youtube" />{data.subscribeLabel}</span>
          </span>
        </a>
        {(showFollowers || others.length > 0) && (
          <div className="social-reach">
            {(showFollowers || data.socialsTitle) && (
              <div className="reach-head">
                {showFollowers && <b className="reach-total num" dir="ltr">{data.followersTotal}</b>}
                <span>
                  {showFollowers && data.followersLabel && <strong>{data.followersLabel}</strong>}
                  {data.socialsTitle && <span>{data.socialsTitle}</span>}
                </span>
              </div>
            )}
            {others.length > 0 && (
              <div className="soc-cards">
                {others.map((s) => (
                  <a key={s.url} className={`soc-card soc-${s.type}`} href={s.url} target="_blank" rel="noopener noreferrer">
                    <span className="soc-ico"><Icon name={s.type} /></span>
                    <span className="soc-txt">
                      <b>{s.label}</b>
                      {s.note && <small>{s.note}</small>}
                    </span>
                    {s.followers && <span className="soc-count num" dir="ltr">{s.followers}</span>}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
