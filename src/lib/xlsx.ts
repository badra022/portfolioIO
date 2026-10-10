/**
 * Reads the cells of an Excel file (.xlsx) in the browser, without a library:
 * an .xlsx is a zip of XML files, unzipped with the browser's own
 * DecompressionStream and read with DOMParser. Values come back as text, as
 * Excel shows them before formatting (numbers as digits, text as typed).
 * Old .xls files aren't supported: save as .xlsx, or copy the cells and paste.
 */

export type Sheet = { name: string; rows: string[][] };

export class XlsxError extends Error {}

type Entry = { name: string; method: number; size: number; offset: number };

function entries(buf: ArrayBuffer): Map<string, Entry> {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66_000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new XlsxError("الملف مش Excel (.xlsx). لو ملف .xls قديم احفظه بصيغة .xlsx، أو انسخ الخلايا والصقها.");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, Entry>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    out.set(name, { name, method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function read(buf: ArrayBuffer, files: Map<string, Entry>, name: string): Promise<string | null> {
  const e = files.get(name);
  if (!e) return null;
  const v = new DataView(buf);
  const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
  const raw = new Uint8Array(buf, start, e.size);
  if (e.method === 0) return new TextDecoder().decode(raw);
  if (e.method !== 8) throw new XlsxError("ضغط غير مدعوم في الملف.");
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");
const all = (n: Document | Element, tag: string) => Array.from(n.getElementsByTagNameNS("*", tag));

/** "B12" -> 1 (zero-based column). */
function colOf(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function readXlsx(buf: ArrayBuffer): Promise<Sheet[]> {
  const files = entries(buf);
  const wb = await read(buf, files, "xl/workbook.xml");
  if (!wb) throw new XlsxError("الملف مش Excel (.xlsx).");
  const rels = xml((await read(buf, files, "xl/_rels/workbook.xml.rels")) ?? "<Relationships/>");
  const target = new Map(all(rels, "Relationship").map((r) => [r.getAttribute("Id"), r.getAttribute("Target") ?? ""]));

  const sharedXml = await read(buf, files, "xl/sharedStrings.xml");
  const shared = sharedXml
    ? all(xml(sharedXml), "si").map((si) => all(si, "t").filter((t) => t.parentElement?.localName !== "rPh").map((t) => t.textContent ?? "").join(""))
    : [];

  const sheets: Sheet[] = [];
  for (const s of all(xml(wb), "sheet")) {
    const rid = s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? s.getAttribute("r:id");
    let path = target.get(rid) ?? "";
    path = path.startsWith("/") ? path.slice(1) : `xl/${path}`;
    const body = await read(buf, files, path);
    if (!body) continue;
    const rows: string[][] = [];
    for (const row of all(xml(body), "row")) {
      const cells: string[] = [];
      all(row, "c").forEach((c, i) => {
        const ref = c.getAttribute("r");
        const col = ref ? colOf(ref) : i;
        const type = c.getAttribute("t");
        const v = all(c, "v")[0]?.textContent ?? "";
        let text: string;
        if (type === "s") text = shared[Number(v)] ?? "";
        else if (type === "inlineStr") text = all(c, "t").map((t) => t.textContent ?? "").join("");
        else if (type === "b") text = v === "1" ? "TRUE" : "FALSE";
        else if (type === "e") text = "";
        else text = v;
        cells[col] = text.trim();
      });
      rows.push(Array.from(cells, (x) => x ?? ""));
    }
    sheets.push({ name: s.getAttribute("name") ?? `Sheet ${sheets.length + 1}`, rows: rows.filter((r) => r.some(Boolean)) });
  }
  if (!sheets.length) throw new XlsxError("مفيش شيت فيه بيانات في الملف.");
  return sheets;
}
