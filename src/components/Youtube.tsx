import type { Content } from "@/lib/schema";
import { asset } from "@/lib/assets";
import { Icon } from "./Icon";
import { SectionHead } from "./SectionHead";

export function Youtube({ data, avatar }: { data: NonNullable<Content["youtube"]>; avatar?: string }) {
  return (
    <section className="block" id="youtube">
      <div className="wrap">
        <SectionHead eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
        {data.videos.length > 0 && (
          <div className="vids">
            {data.videos.map((v) => (
              <a className="vid" key={v.id} href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer">
                <span className="thumb">
                  <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" />
                  <span className="play"><Icon name="play" /></span>
                </span>
                <b>{v.title}</b>
                {v.caption && <span>{v.caption}</span>}
              </a>
            ))}
          </div>
        )}
        <a className="yt-card" href={data.channelUrl} target="_blank" rel="noopener noreferrer">
          <span className="yt-id">
            {avatar && <img src={asset(avatar)} alt="" width={56} height={56} />}
            <span><b>{data.channelName}</b><small dir="ltr">{data.channelUrl.replace(/^https?:\/\/(www\.)?/, "")}</small></span>
          </span>
          <span className="btn btn-wa btn-sm"><Icon name="youtube" />{data.subscribeLabel}</span>
        </a>
      </div>
    </section>
  );
}
