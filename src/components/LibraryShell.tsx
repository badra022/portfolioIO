import type { Content } from "@/lib/schema";
import { ui, tf } from "@/lib/i18n";
import { Icon } from "./Icon";

/**
 * The frame of the content library's pages (/articles, /games, /exams and each
 * article and game): the teacher's header, a way back to the main site, the page's
 * title and line under it.
 */
export function LibraryShell({ c, base, title, intro, back, children, wide }: {
  c: Content;
  base: string;
  title?: string;
  intro?: string;
  /** Where «back» goes (default: the main site). */
  back?: { href: string; label: string };
  wide?: boolean;
  children: React.ReactNode;
}) {
  const t = ui(c.locale);
  const to = back ?? { href: `${base}/`, label: tf(t.libBack, { name: c.profile.fullTitle }) };
  return (
    <>
      <header className="nav">
        <div className="wrap">
          <a className="logo" href={`${base}/`} aria-label={c.profile.fullTitle}>
            {c.profile.logo ? <img src={c.profile.logo} alt={c.profile.fullTitle} /> : <span className="logo-text">{c.profile.fullTitle}</span>}
          </a>
          <span className="quiz-who">{c.profile.fullTitle}</span>
        </div>
      </header>
      <main className={`wrap lib-wrap${wide ? " wide" : ""}`}>
        <a className="lib-back" href={to.href}><Icon name="arrow" />{to.label}</a>
        {title && (
          <div className="lib-head">
            <h1>{title}</h1>
            {intro && <p>{intro}</p>}
          </div>
        )}
        {children}
      </main>
    </>
  );
}
