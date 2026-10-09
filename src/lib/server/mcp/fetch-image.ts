import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { MAX_INPUT } from "../admin-ops";

/**
 * Downloads an image from a public link for the MCP server. The server must never
 * be tricked into reading internal addresses (cloud metadata, the database...), so
 * every hop is checked: https/http only, public IPs only, redirects re-checked,
 * size and time capped.
 */

const PRIVATE_V4: [number, number][] = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16],
  [0xac100000, 12], [0xc0000000, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xe0000000, 3],
];

function isPublicIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const n = ip.split(".").reduce((a, p) => (a << 8) + Number(p), 0) >>> 0;
    return !PRIVATE_V4.some(([net, bits]) => (n >>> (32 - bits)) === (net >>> (32 - bits)));
  }
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return false;
  if (v.startsWith("::ffff:")) return isPublicIp(v.slice(7));
  return !/^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

/** Share links that point to a viewer page are turned into direct downloads. */
export function directLink(raw: string): string {
  const url = new URL(raw);
  const drive = url.hostname === "drive.google.com" && (url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? url.searchParams.get("id"));
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive}`;
  if (/(^|\.)dropbox\.com$/.test(url.hostname)) { url.searchParams.set("dl", "1"); return url.toString(); }
  return url.toString();
}

export async function fetchImage(raw: string): Promise<Uint8Array> {
  let url = new URL(directLink(raw));
  for (let hop = 0; hop < 5; hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http(s) links are allowed.");
    if (url.username || url.password) throw new Error("Links with credentials are not allowed.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    if (!ips.length || !ips.every(isPublicIp)) throw new Error("That address is not a public internet address.");

    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "portfolioIO-mcp/1.0" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status}).`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_INPUT) throw new Error("Image is larger than 20 MB.");
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_INPUT) { await reader.cancel(); throw new Error("Image is larger than 20 MB."); }
      chunks.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.byteLength; }
    return out;
  }
  throw new Error("Too many redirects.");
}
