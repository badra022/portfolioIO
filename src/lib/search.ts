/**
 * Forgiving search for the list pages (/articles, /games, /exams), safe in the browser.
 * Arabic letters that people type interchangeably count as one: أ إ آ ٱ ا, ى ي ئ, ة ه,
 * ؤ و; diacritics and tatweel are ignored; Arabic-Indic digits count as Latin ones;
 * case and repeated spaces don't matter.
 */
const FOLD: Record<string, string> = {
  "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ٲ": "ا", "ٳ": "ا",
  "ى": "ي", "ئ": "ي", "ی": "ي",
  "ة": "ه",
  "ؤ": "و",
  "ک": "ك",
};
const IGNORED = /[ً-ٰٟـۖ-ۭ]/;

function foldChar(ch: string): string {
  if (IGNORED.test(ch)) return "";
  if (FOLD[ch]) return FOLD[ch];
  const code = ch.charCodeAt(0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  if (/\s/.test(ch)) return " ";
  return ch.toLowerCase();
}

/** The text as the search compares it. */
export function foldSearch(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) out += foldChar(ch);
  return out.replace(/ +/g, " ").trim();
}

/**
 * Where `query` appears in `text`, as [start, end) ranges in the ORIGINAL text, so a
 * match can be highlighted even when the letters differ (أ vs ا) or diacritics sit in between.
 * Every word of the query is searched on its own.
 */
export function matchRanges(text: string, query: string): [number, number][] {
  const words = foldSearch(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  // The folded text, and for each folded character the index it came from.
  let folded = "";
  const from: number[] = [];
  const to: number[] = [];
  let prevSpace = true;
  const chars = Array.from(text.normalize("NFC"));
  let pos = 0;
  for (const ch of chars) {
    let f = foldChar(ch);
    if (f === " ") { if (prevSpace) f = ""; prevSpace = true; } else if (f) prevSpace = false;
    for (let k = 0; k < f.length; k++) { folded += f[k]; from.push(pos); to.push(pos + ch.length); }
    pos += ch.length;
  }
  const ranges: [number, number][] = [];
  for (const w of words) {
    let at = folded.indexOf(w);
    while (at !== -1) {
      ranges.push([from[at], to[at + w.length - 1]]);
      at = folded.indexOf(w, at + w.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

/** True when every word of the query is found in one of the texts. */
export function matches(query: string, ...texts: (string | undefined)[]): boolean {
  const words = foldSearch(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const hay = foldSearch(texts.filter(Boolean).join(" \u0001 "));
  return words.every((w) => hay.includes(w));
}
