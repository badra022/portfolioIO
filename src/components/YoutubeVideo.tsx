"use client";
import { useState } from "react";
import { Icon } from "./Icon";

/**
 * Thumbnail that turns into the YouTube player when tapped. The player (and its
 * cookies and ~1 MB of script) only loads on demand, so the page stays fast.
 * Without JavaScript, or with a modifier key, it opens the video on YouTube.
 * `bare` shows only the player (no title link underneath).
 */
export function YoutubeVideo({ id, title, caption, bare }: { id: string; title: string; caption?: string; bare?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const watchUrl = `https://www.youtube.com/watch?v=${id}`;

  return (
    <div className="vid">
      {playing ? (
        <span className="thumb">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </span>
      ) : (
        <a
          className="thumb"
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={title}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            setPlaying(true);
          }}
        >
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" />
          <span className="play"><Icon name="play" /></span>
        </a>
      )}
      {!bare && <a className="vid-title" href={watchUrl} target="_blank" rel="noopener noreferrer"><b>{title}</b></a>}
      {!bare && caption && <span>{caption}</span>}
    </div>
  );
}
