/**
 * Structured data (schema.org JSON-LD) for a teacher's page, built from the
 * content they already maintain. One engine for every teacher: nothing to set
 * up per site, and a fix here improves all of them.
 *
 * Rules: only what is visible on the page is described (search engines and AI
 * systems discount markup that isn't), no self-written review ratings (Google
 * doesn't allow them), and nothing is invented (no prices, dates or addresses
 * that the teacher didn't enter).
 *
 * Type-only imports, so scripts/validate.ts can run this in plain Node.
 */
import type { Content, RichTextT } from "./schema";

type Node = Record<string, unknown>;
export type JsonLd = { "@context": "https://schema.org"; "@graph": Node[] };

const DAY: Record<string, string> = {
  sat: "Saturday", sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday",
};

const plain = (r: RichTextT | undefined) => (r ?? []).map((s) => s.text).join("").replace(/\s+/g, " ").trim();
const clean = <T extends Node>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))) as T;

/** Cairo's UTC offset on a date ("+02:00" / "+03:00"), so event times are unambiguous. */
function cairoOffset(isoDate: string): string {
  const at = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", timeZoneName: "shortOffset" }).formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT+2";
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  return m ? `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}` : "+02:00";
}

/** Exam dates as entered: a day stays a day; a time gets Cairo's offset. */
function eventDate(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/[+-]\d{2}:\d{2}$|Z$/.test(v)) return v;
  return `${v.length === 16 ? `${v}:00` : v}${cairoOffset(v)}`;
}

/** First number in a fee like "50 جنيه" or "٥٠ج", for an Offer. Null when there is no clear amount. */
function amount(fee: string | undefined): string | null {
  if (!fee) return null;
  const latin = fee.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const m = latin.match(/\d+(?:[.,]\d+)?/);
  return m ? m[0].replace(",", ".") : null;
}

/** Egyptian mobiles written locally (01xxxxxxxxx) in international form, as schema.org expects. */
const intlPhone = (v: string) => {
  const d = v.replace(/[^\d+]/g, "");
  return /^01\d{9}$/.test(d) ? `+2${d}` : /^20\d{10}$/.test(d) ? `+${d}` : d;
};

const youtubeId = (v: string) => (/^[\w-]{11}$/.test(v) ? v : v.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/)?.[1] ?? null);

export type StructuredDataOptions = {
  /** Absolute URL of the teacher's main address ("https://teacher.com"), or null on previews. */
  canonical: string | null;
};

/**
 * The page's knowledge graph: the website and page, the teacher (Person) and
 * their classes (EducationalOrganization), each subject/grade as a Course with
 * its weekly groups, upcoming exams as EducationEvents, the book, and the
 * featured videos. Entities link to each other by @id.
 */
export function structuredData(c: Content, { canonical }: StructuredDataOptions): JsonLd {
  const root = canonical ? `${canonical}/` : "";
  const id = (frag: string) => `${root}#${frag}`;
  const lang = c.locale;
  const p = c.profile;
  const sameAs = [...new Set(c.socials.map((s) => s.url).concat(c.youtube?.channelUrl ?? []))];
  const phones = (c.contact.phones.length ? c.contact.phones : [c.contact.whatsapp]).map(intlPhone);
  // Images are full URLs on live sites; a site-relative path is made absolute when the address is known.
  const img = (u: string | undefined) => (u && u.startsWith("/") && canonical ? `${canonical}${u}` : u);
  const defaultPlace = c.schedule?.location?.trim();

  const graph: Node[] = [];

  graph.push(clean({
    "@type": "WebSite",
    "@id": id("website"),
    url: root || undefined,
    name: p.fullTitle,
    inLanguage: lang,
    publisher: { "@id": id("organization") },
  }));

  graph.push(clean({
    "@type": "WebPage",
    "@id": id("webpage"),
    url: root || undefined,
    name: c.seo.title,
    description: c.seo.description,
    inLanguage: lang,
    isPartOf: { "@id": id("website") },
    about: { "@id": id("teacher") },
    primaryImageOfPage: p.photo ? { "@type": "ImageObject", url: img(p.photo) } : undefined,
  }));

  graph.push(clean({
    "@type": "Person",
    "@id": id("teacher"),
    name: p.fullTitle,
    alternateName: [p.name, p.latinName].filter((n): n is string => Boolean(n) && n !== p.fullTitle),
    jobTitle: p.role,
    description: plain(c.hero.lede) || c.seo.description,
    image: img(p.photo),
    url: root || undefined,
    telephone: phones[0],
    knowsAbout: [...new Set((c.grades?.stages ?? []).flatMap((s) => s.items.map((i) => i.subject)).concat(c.schedule?.slots.map((s) => s.subject) ?? []))],
    worksFor: { "@id": id("organization") },
    sameAs,
  }));

  const areas = [...new Set((c.schedule?.slots ?? []).map((s) => s.area?.trim()).filter((a): a is string => Boolean(a)))];
  graph.push(clean({
    "@type": "EducationalOrganization",
    "@id": id("organization"),
    name: p.fullTitle,
    url: root || undefined,
    logo: img(p.logo ?? p.avatar),
    image: img(p.photo),
    description: c.seo.description,
    telephone: phones,
    founder: { "@id": id("teacher") },
    areaServed: areas.map((a) => ({ "@type": "Place", name: a })),
    location: defaultPlace ? { "@type": "Place", name: defaultPlace } : undefined,
    sameAs,
  }));

  // Courses: every subject/grade from the grades section and the schedule; the
  // schedule's groups for that grade and subject become its weekly sessions.
  const courses = new Map<string, { grade: string; subject: string }>();
  for (const st of c.grades?.stages ?? []) for (const it of st.items) courses.set(`${it.name}|${it.subject}`, { grade: it.name, subject: it.subject });
  for (const s of c.schedule?.slots ?? []) courses.set(`${s.grade}|${s.subject}`, { grade: s.grade, subject: s.subject });
  let n = 0;
  for (const [k, course] of courses) {
    n++;
    const groups = (c.schedule?.slots ?? []).filter((s) => `${s.grade}|${s.subject}` === k);
    graph.push(clean({
      "@type": "Course",
      "@id": id(`course-${n}`),
      name: `${course.subject} — ${course.grade}`,
      description: `${course.subject} ${course.grade} مع ${p.fullTitle}`,
      educationalLevel: course.grade,
      about: course.subject,
      inLanguage: lang,
      provider: { "@id": id("organization") },
      instructor: { "@id": id("teacher") },
      hasCourseInstance: groups.map((g) => {
        const place = g.center?.trim() || defaultPlace;
        const online = /أونلاين|اونلاين|online/i.test(g.mode ?? "");
        return clean({
          "@type": "CourseInstance",
          courseMode: online ? "Online" : "Onsite",
          location: online ? undefined : clean({ "@type": "Place", name: [g.area?.trim(), place].filter(Boolean).join(" - ") || undefined }),
          instructor: { "@id": id("teacher") },
          courseSchedule: g.days.length ? clean({
            "@type": "Schedule",
            repeatFrequency: "P1W",
            byDay: g.days.map((d) => `https://schema.org/${DAY[d]}`),
            startTime: g.time ?? undefined,
            scheduleTimezone: "Africa/Cairo",
          }) : undefined,
        });
      }),
    }));
  }

  // Exams still shown on the page (past ones are already removed before rendering).
  for (const e of c.exams?.items ?? []) {
    const price = amount(e.fee);
    graph.push(clean({
      "@type": "EducationEvent",
      "@id": id(`exam-${e.id}`),
      name: e.title,
      description: [e.tracks.map((t) => `${t.label}: ${t.scope}`).join(" · "), e.prize].filter(Boolean).join(" — "),
      startDate: eventDate(e.date),
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: { "@type": "Place", name: e.place?.trim() || defaultPlace || p.fullTitle },
      organizer: { "@id": id("organization") },
      performer: { "@id": id("teacher") },
      inLanguage: lang,
      offers: price ? { "@type": "Offer", price, priceCurrency: "EGP", url: root ? `${root}#exams` : undefined, availability: "https://schema.org/InStock" } : undefined,
    }));
  }

  if (c.book) {
    graph.push(clean({
      "@type": "Book",
      "@id": id("book"),
      name: c.book.seriesName || plain(c.book.title),
      description: c.book.intro || c.book.coverAlt,
      image: img(c.book.cover),
      author: { "@id": id("teacher") },
      inLanguage: lang,
      educationalLevel: c.book.order.grades,
    }));
  }

  for (const v of c.youtube?.videos ?? []) {
    const vid = youtubeId(v.id);
    if (!vid) continue;
    graph.push(clean({
      "@type": "VideoObject",
      "@id": id(`video-${vid}`),
      name: v.title,
      description: v.caption || v.title,
      thumbnailUrl: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${vid}`,
      contentUrl: `https://www.youtube.com/watch?v=${vid}`,
      inLanguage: lang,
      creator: { "@id": id("teacher") },
    }));
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

/** The JSON for a <script type="application/ld+json"> tag, safe to inline in HTML. */
export const jsonLdScript = (data: JsonLd) =>
  JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** Properties each type must have to be useful to search engines (Google's required fields where it has them). */
const REQUIRED: Record<string, string[]> = {
  WebSite: ["name"],
  WebPage: ["name"],
  Person: ["name"],
  EducationalOrganization: ["name"],
  Course: ["name", "description", "provider"],
  CourseInstance: ["courseMode"],
  EducationEvent: ["name", "startDate", "location"],
  Book: ["name", "author"],
  VideoObject: ["name", "description", "thumbnailUrl"],
};

/** Problems in a graph (empty = fine). Used by scripts/validate.ts in CI. */
export function checkStructuredData(data: JsonLd): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const refs: string[] = [];
  const walk = (v: unknown, where: string) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${where}[${i}]`)); return; }
    if (!v || typeof v !== "object") {
      if (typeof v === "string" && /\bundefined\b|\bNaN\b|\[object Object\]/.test(v)) problems.push(`${where}: suspicious value "${v}"`);
      if (typeof v === "number" && !Number.isFinite(v)) problems.push(`${where}: not a number`);
      return;
    }
    const o = v as Node;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === "@id") { refs.push(String(o["@id"])); return; }
    const type = o["@type"] as string | undefined;
    if (type) {
      for (const k of REQUIRED[type] ?? []) if (o[k] === undefined || o[k] === "") problems.push(`${where} (${type}): missing ${k}`);
      if (type === "EducationEvent" && typeof o.startDate === "string" && Number.isNaN(Date.parse(o.startDate))) problems.push(`${where}: bad startDate ${o.startDate}`);
    }
    if (typeof o["@id"] === "string") {
      if (ids.has(o["@id"])) problems.push(`${where}: duplicate @id ${o["@id"]}`);
      ids.add(o["@id"]);
    }
    for (const k of keys) walk(o[k], `${where}.${k}`);
  };
  data["@graph"].forEach((n, i) => {
    if (!n["@type"] || !n["@id"]) problems.push(`@graph[${i}]: needs @type and @id`);
    walk(n, `@graph[${i}]`);
  });
  for (const r of refs) if (!ids.has(r)) problems.push(`reference to missing ${r}`);
  if (/<\/script/i.test(jsonLdScript(data))) problems.push("script tag could be closed by the content");
  return problems;
}
