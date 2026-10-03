import type { Theme } from "./schema";

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Turns theme.json into CSS custom properties consumed by globals.css. */
export function themeCss(theme: Theme): string {
  const vars: string[] = [];
  for (const [k, v] of Object.entries(theme.colors)) vars.push(`--${kebab(k)}:${v}`);
  vars.push(`--f-display:${theme.fonts.display}`);
  vars.push(`--f-body:${theme.fonts.body}`);
  vars.push(`--f-num:${theme.fonts.numeric}`);
  vars.push(`--r-card:${theme.radius.card}`, `--r-control:${theme.radius.control}`, `--r-pill:${theme.radius.pill}`);
  vars.push(`--tag-rotate:${theme.options.tagRotation}deg`);
  vars.push(`color-scheme:${theme.scheme}`);
  return `:root{${vars.join(";")}}`;
}

export function themeAttrs(theme: Theme): Record<string, string> {
  return {
    "data-texture": theme.options.texture,
    "data-glow": String(theme.options.glow),
    "data-photo": theme.options.heroPhotoShape,
    "data-button-glow": String(theme.options.buttonGlow),
  };
}
