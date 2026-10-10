/**
 * Exam results: the rules for reading a teacher's sheet (Excel, CSV or pasted
 * text), merging it into an exam's results, and finding one student's result by
 * name and phone. Shared by the admin panel, the server and the MCP tools, so a
 * student is matched exactly as the teacher's import was.
 *
 * Matching: the phone number without its country code or leading zero, and the
 * first name with spelling noise removed (diacritics, hamza forms, ة/ه, ى/ي,
 * punctuation, extra spaces). Brothers sharing a parent's phone are told apart
 * by the first name.
 */

export type ResultRow = { name: string; phone: string; score: string; note?: string };

/** Limits for one exam's results. */
export const MAX_ROWS = 3000;

const digitsOf = (v: string) =>
  v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/**
 * A phone number as a comparison key: digits only, without 00/+, the Egyptian
 * country code (20) or the leading 0. "+20 100 971 9950", "01009719950" and
 * "1009719950" (Excel dropped the zero) are all "1009719950".
 */
export function phoneKey(v: string): string {
  let s = digitsOf(String(v ?? "")).trim();
  // Excel sometimes writes long numbers as 2.01009719950E+11.
  if (/^\d(\.\d+)?e\+?\d+$/i.test(s)) s = Number(s).toFixed(0);
  let d = s.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("20") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

/** A plausible phone key (8–13 digits; Egyptian mobiles are 10 digits starting with 1). */
export const isPhoneKey = (k: string) => /^\d{8,13}$/.test(k);

/** A name with spelling noise removed, for comparing. */
export function nameKey(v: string): string {
  return String(v ?? "")
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "") // diacritics, tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The first name as a comparison key. Compound first names ("عبد الله", "أبو بكر") count as one. */
export function firstNameKey(v: string): string {
  const parts = nameKey(v).split(" ").filter(Boolean);
  if (!parts.length) return "";
  if ((parts[0] === "عبد" || parts[0] === "ابو") && parts[1]) return parts[0] + parts[1];
  return parts[0];
}

/** Which rows are the same student: same phone and same first name (or the same full name when there's no phone). */
export function rowKey(r: Pick<ResultRow, "name" | "phone">): string {
  const p = phoneKey(r.phone);
  return p ? `${p}|${firstNameKey(r.name)}` : `~${nameKey(r.name)}`;
}

/** Trims and caps a row; null when it has nothing usable. */
export function cleanRow(r: Partial<Record<keyof ResultRow, unknown>>): ResultRow | null {
  const s = (v: unknown, max: number) => (typeof v === "number" ? String(v) : typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, max);
  const row: ResultRow = { name: s(r.name, 120), phone: s(r.phone, 30), score: s(r.score, 30) };
  const note = s(r.note, 200);
  if (note) row.note = note;
  if (!row.name && !row.phone) return null;
  return row;
}

/** Finds a student's result. Both the phone and the first name must match. */
export function findResult<R extends ResultRow>(rows: R[], name: string, phone: string): R | null {
  const p = phoneKey(phone);
  const f = firstNameKey(name);
  if (!isPhoneKey(p) || !f) return null;
  return rows.find((r) => phoneKey(r.phone) === p && firstNameKey(r.name) === f) ?? null;
}

const words = (v: string) => nameKey(v).split(" ").filter(Boolean).length;

export type MergeSummary = { added: number; updated: number; unchanged: number; duplicates: number };

/**
 * Adds imported rows to an exam's results. A row for a student already there
 * (same phone + first name) replaces their score/note; "replace" starts from empty.
 * Repeated rows inside the import count once (the last one wins).
 */
export function mergeRows(existing: ResultRow[], incoming: ResultRow[], mode: "merge" | "replace"): { rows: ResultRow[]; summary: MergeSummary } {
  const rows = mode === "replace" ? [] : existing.map((r) => ({ ...r }));
  const at = new Map(rows.map((r, i) => [rowKey(r), i]));
  const seen = new Set<string>();
  const summary: MergeSummary = { added: 0, updated: 0, unchanged: 0, duplicates: 0 };
  for (const r of incoming) {
    const k = rowKey(r);
    const i = at.get(k);
    if (seen.has(k)) { summary.duplicates++; rows[i!] = { ...r, note: r.note ?? rows[i!].note }; continue; }
    seen.add(k);
    if (i === undefined) {
      at.set(k, rows.length);
      rows.push({ ...r });
      summary.added++;
      continue;
    }
    const old = rows[i];
    // A shorter spelling ("احمد" for "أحمد محمد علي") and a sheet without notes don't erase what's there.
    const next: ResultRow = { ...r, name: words(r.name) >= words(old.name) ? r.name : old.name };
    if (!next.note && old.note) next.note = old.note;
    const same = old.score === next.score && (old.note ?? "") === (next.note ?? "") && old.name === next.name && old.phone === next.phone;
    rows[i] = next;
    if (same) summary.unchanged++;
    else summary.updated++;
  }
  return { rows, summary };
}

/** Percentage when score and total are numbers, else null. */
export function percentOf(score: string, total: string | null | undefined): number | null {
  const n = Number(digitsOf(score).replace(",", "."));
  const t = Number(digitsOf(total ?? "").replace(",", "."));
  if (!score.trim() || !Number.isFinite(n) || !Number.isFinite(t) || t <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((n / t) * 100)));
}

/* ------------------------------------------------------------------ */
/* Reading a sheet                                                     */
/* ------------------------------------------------------------------ */

/** Splits pasted text or a CSV/TSV file into cells. Copying from Excel gives tab-separated lines. */
export function parseText(text: string): string[][] {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const first = lines.find((l) => l.trim()) ?? "";
  const count = (ch: string) => first.split(ch).length - 1;
  const delim = count("\t") ? "\t" : count(";") > count(",") ? ";" : count(",") ? "," : count("،") ? "،" : "\t";
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = lines.join("\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); out.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell);
  out.push(row);
  return out.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

export type Columns = { name: number; phone: number; score: number; note: number; header: boolean };

const HEAD = {
  name: /اسم|الاسم|name|student|طالب/i,
  phone: /تليفون|تلفون|موبايل|محمول|هاتف|جوال|واتس|phone|mobile|tel|whats/i,
  score: /درج|نتيج|مجموع|score|grade|mark|result|total/i,
  note: /ملاحظ|تقدير|تعليق|note|comment|remark/i,
};

/**
 * Guesses which column is which, from the header words when there is a header,
 * else from the values (phone-like numbers, names, small numbers). -1 = none.
 */
export function guessColumns(table: string[][]): Columns {
  const width = Math.max(0, ...table.map((r) => r.length));
  const head = table[0] ?? [];
  const byHead = (re: RegExp, not?: RegExp) => head.findIndex((c) => re.test(c) && !(not && not.test(c)));
  const header = head.some((c) => Object.values(HEAD).some((re) => re.test(c))) && !head.some((c) => isPhoneKey(phoneKey(c)) && c.replace(/\D/g, "").length >= 9);
  const body = header ? table.slice(1) : table;
  const share = (col: number, test: (v: string) => boolean) => {
    const vals = body.map((r) => r[col] ?? "").filter(Boolean);
    return vals.length ? vals.filter(test).length / vals.length : 0;
  };
  const isPhone = (v: string) => v.replace(/\D/g, "").length >= 9 && isPhoneKey(phoneKey(v));
  const isName = (v: string) => /\p{L}{2,}/u.test(v) && !/\d{5,}/.test(v);
  const isScore = (v: string) => /^\s*[\d٠-٩]+([.,][\d٠-٩]+)?\s*(\/\s*[\d٠-٩]+)?\s*$/.test(v) && !isPhone(v);
  const cols = [...Array(width).keys()];
  const best = (test: (v: string) => boolean, taken: number[]) => {
    let at = -1, top = 0.5;
    for (const c of cols) if (!taken.includes(c)) { const s = share(c, test); if (s > top) { top = s; at = c; } }
    return at;
  };
  let phone = header ? byHead(HEAD.phone) : -1;
  if (phone < 0) phone = best(isPhone, []);
  let name = header ? byHead(HEAD.name, HEAD.phone) : -1;
  if (name < 0) name = best(isName, [phone]);
  let score = header ? byHead(HEAD.score, /رقم/) : -1;
  if (score < 0 || score === phone || score === name) score = best(isScore, [phone, name]);
  let note = header ? byHead(HEAD.note) : -1;
  if ([phone, name, score].includes(note)) note = -1;
  return { name, phone, score, note, header };
}

export type ReadRows = { rows: ResultRow[]; problems: string[] };

/** Turns a sheet into result rows using the chosen columns. Problems are listed by sheet row number. */
export function rowsFromTable(table: string[][], cols: Columns): ReadRows {
  const rows: ResultRow[] = [];
  const problems: string[] = [];
  const body = cols.header ? table.slice(1) : table;
  const at = (r: string[], i: number) => (i >= 0 ? r[i] ?? "" : "");
  body.forEach((r, i) => {
    const line = i + 1 + (cols.header ? 1 : 0);
    const row = cleanRow({ name: at(r, cols.name), phone: at(r, cols.phone), score: at(r, cols.score), note: at(r, cols.note) });
    if (!row) return;
    if (!row.name) problems.push(`سطر ${line}: من غير اسم`);
    if (!row.phone) problems.push(`سطر ${line}: من غير رقم (${row.name}) – مش هيقدر يشوف نتيجته من الموقع`);
    else if (!isPhoneKey(phoneKey(row.phone))) problems.push(`سطر ${line}: الرقم "${row.phone}" مش واضح (${row.name})`);
    rows.push(row);
  });
  if (rows.length > MAX_ROWS) {
    problems.unshift(`الحد الأقصى ${MAX_ROWS} طالب في الامتحان الواحد؛ اتاخد أول ${MAX_ROWS}.`);
    rows.length = MAX_ROWS;
  }
  return { rows, problems };
}
