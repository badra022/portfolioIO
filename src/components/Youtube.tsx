import type { Content } from "@/lib/schema";
import { asset } from "@/lib/assets";
import { Icon } from "./Icon";
import { YoutubeVideo } from "./YoutubeVideo";
import { youtubeId } from "@/lib/youtube";
import { SectionHead } from "./SectionHead";

export function Youtube({ data, avatar }: { data: NonNullable<Content["youtube"]>; avatar?: string }) {
  const videos = data.videos.flatMap((v) => {
    const id = youtubeId(v.id);
    return id ? [{ ...v, id }] : [];
  });
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
            <span><b>{data.channelName}</b><small dir="ltr">{data.channelUrl.replace(/^https?:\/\/(www\.)?/, "")}</small></span>
          </span>
          <span className="btn btn-wa btn-sm"><Icon name="youtube" />{data.subscribeLabel}</span>
        </a>
      </div>
    </section>
  );
}
