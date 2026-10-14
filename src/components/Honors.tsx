import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { youtubeId } from "@/lib/youtube";
import { ActionButton } from "./ActionButton";
import { SectionHead } from "./SectionHead";
import { Icon } from "./Icon";
import { YoutubeVideo } from "./YoutubeVideo";
import { Carousel } from "./Carousel";
import { HonorPhotos } from "./HonorPhotos";
import { ReadMore } from "./ReadMore";

type Data = NonNullable<Content["honors"]>;
type Item = Data["items"][number];

/**
 * The honor board (لوحة الشرف): the teacher's top students. Each entry has its
 * photos (a grid when there are several), the grade, lines with icons, an
 * optional video, a long description folded after a few lines, and a button.
 * Image URLs arrive resolved (lib/server/assets.ts).
 */
export function Honors({ data, chat }: { data: Data; chat: ChatConfig }) {
  const items = data.items.filter((it) => it.name.trim());
  if (!items.length) return null;
  // auto: one entry under the other; more than two swipe one at a time.
  const display = data.display === "auto" ? (items.length > 2 ? "carousel" : "list") : data.display;
  const wide = display !== "grid";
  return (
    <section className="block" id="honors">
      <div className="wrap">
        <SectionHead eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
        <Carousel display={display} className={`hb-list${wide ? " wide" : ""}`} per={wide ? 1 : 2} label={data.eyebrow}>
          {items.map((it, i) => <Entry key={it.name + i} it={it} chat={chat} />)}
        </Carousel>
        {data.cta && <div className="hb-foot"><ActionButton action={data.cta} chat={chat} /></div>}
      </div>
    </section>
  );
}

function Entry({ it, chat }: { it: Item; chat: ChatConfig }) {
  const photos = it.images.map((p, i) => ({ src: p.image, alt: p.alt?.trim() || `${it.name}${it.images.length > 1 ? ` ${i + 1}` : ""}` }));
  const vid = it.video ? youtubeId(it.video) : null;
  const video = vid ? <YoutubeVideo id={vid} title={it.name} bare /> : null;
  // Photos take the media side; a video goes there only when there are no photos.
  const media = photos.length ? <HonorPhotos photos={photos} /> : video;
  return (
    <article className={`hb-card${media ? "" : " no-media"}`}>
      {media && <div className="hb-media">{media}</div>}
      <div className="hb-body">
        <div className="hb-head">
          <span className="hb-icon"><Icon name={it.icon} /></span>
          <div>
            <h3>{it.name}</h3>
            {it.grade && <span className="hb-grade">{it.grade}</span>}
          </div>
          {it.score && <b className="hb-score num">{it.score}</b>}
        </div>
        {it.highlights.some((h) => h.text.trim()) && (
          <ul className="hb-lines">
            {it.highlights.filter((h) => h.text.trim()).map((h, i) => <li key={i}><Icon name={h.icon} />{h.text}</li>)}
          </ul>
        )}
        {it.description?.trim() && <ReadMore text={it.description.trim()} className="hb-text" />}
        {photos.length > 0 && video && <div className="hb-video">{video}</div>}
        {it.cta && <div className="hb-actions"><ActionButton action={it.cta} chat={chat} /></div>}
      </div>
    </article>
  );
}
