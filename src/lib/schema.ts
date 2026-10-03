/**
 * Tenant schemas. Every teacher folder under /tenants/<slug>/ is validated
 * against these at build time, so a typo in someone's JSON fails the build
 * instead of shipping a broken page.
 */
import { z } from "zod";

/* ---------- shared pieces ---------- */

/** A run of text. `accent` = brand color, `tag` = boxed highlight, `strong` = bold. */
export const Segment = z.object({
  text: z.string(),
  style: z.enum(["accent", "tag", "strong"]).optional(),
});
export const RichText = z.array(Segment);

/** A call to action that opens a chat with a pre-written message. */
export const ChatCta = z.object({
  label: z.string(),
  message: z.string(),
  /** Short code appended to the message so the team knows which button was used. */
  ref: z.string().optional(),
});

export const LinkCta = z.object({ label: z.string(), href: z.string() });

const SectionHead = {
  eyebrow: z.string(),
  title: RichText,
  intro: z.string().optional(),
};

export const DayKey = z.enum(["sat", "sun", "mon", "tue", "wed", "thu", "fri"]);

/* ---------- sections ---------- */

export const SectionKey = z.enum([
  "hero", "grades", "schedule", "method", "book",
  "students", "challenge", "exams", "youtube", "final",
]);

const Hero = z.object({
  kicker: z.string(),
  headline: z.array(RichText).min(1),
  lede: RichText,
  primaryCta: ChatCta,
  secondaryCta: LinkCta.optional(),
  stats: z.array(z.object({
    value: z.string(),
    prefix: z.string().optional(),
    label: z.string(),
  })).default([]),
});

const Grades = z.object({
  ...SectionHead,
  stages: z.array(z.object({
    id: z.string(),
    name: z.string(),
    note: z.string().optional(),
    items: z.array(z.object({ name: z.string(), subject: z.string() })),
  })),
});

const Schedule = z.object({
  ...SectionHead,
  location: z.string(),
  filters: z.object({ stage: z.boolean().default(true), day: z.boolean().default(true) }),
  labels: z.object({
    all: z.string(), stage: z.string(), day: z.string(),
    pm: z.string(), am: z.string(), tbd: z.string(), empty: z.string(),
    book: z.string(), ask: z.string(),
  }),
  slots: z.array(z.object({
    id: z.string(),
    grade: z.string(),
    subject: z.string(),
    stage: z.string(),
    days: z.array(DayKey),
    /** 24h "HH:MM", or null when the time isn't announced yet. */
    time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    mode: z.string().optional(),
  })),
  messages: z.object({ book: z.string(), ask: z.string() }),
});

const Method = z.object({
  ...SectionHead,
  items: z.array(z.object({
    icon: z.enum(["book", "chat", "check", "loop", "trophy", "bolt", "star", "users"]),
    title: z.string(),
    text: z.string(),
  })),
});

const Book = z.object({
  ...SectionHead,
  seriesName: z.string().optional(),
  cover: z.string(),
  backCover: z.string().optional(),
  coverAlt: z.string(),
  features: z.array(z.object({ value: z.string(), label: z.string() })),
  order: z.object({
    title: z.string(),
    gradeLabel: z.string(),
    deliveryLabel: z.string(),
    grades: z.array(z.string()).min(1),
    delivery: z.array(z.object({ id: z.string(), label: z.string(), value: z.string() })).min(1),
    cta: z.string(),
    message: z.string(),
    ref: z.string().optional(),
    /** Optional separate number for book orders. Falls back to contact.whatsapp. */
    whatsapp: z.string().optional(),
    note: z.string().optional(),
    notePhone: z.string().optional(),
  }),
});

const Students = z.object({
  eyebrow: z.string(),
  count: z.string(),
  prefix: z.string().optional(),
  title: RichText,
  text: z.string(),
  photo: z.string().nullable(),
  cta: ChatCta,
});

const Challenge = z.object({
  ...SectionHead,
  sendLabel: z.string(),
  message: z.string(),
  questions: z.array(z.object({
    level: z.string(),
    question: z.string(),
    options: z.array(z.string()).min(2),
    /** true = placeholder written for the demo; replace with the teacher's own. */
    draft: z.boolean().optional(),
  })),
});

const Exams = z.object({
  ...SectionHead,
  labels: z.object({
    scope: z.string(), prize: z.string(), trackLabel: z.string(),
    countdown: z.string(), days: z.string(), hours: z.string(), minutes: z.string(), today: z.string(),
  }),
  items: z.array(z.object({
    id: z.string(),
    title: z.string(),
    /** ISO date (YYYY-MM-DD) or datetime with offset. */
    date: z.string(),
    featured: z.boolean().optional(),
    place: z.string().optional(),
    fee: z.string().optional(),
    prize: z.string().optional(),
    tracks: z.array(z.object({ id: z.string(), label: z.string(), scope: z.string() })).min(1),
    cta: z.string(),
    message: z.string(),
  })),
  /** Top announcement bar for the featured exam. {date} is filled in. */
  announcement: z.string().optional(),
});

const Youtube = z.object({
  ...SectionHead,
  channelName: z.string(),
  channelUrl: z.string().url(),
  subscribeLabel: z.string(),
  videos: z.array(z.object({
    id: z.string(),
    title: z.string(),
    caption: z.string().optional(),
  })).default([]),
});

const Final = z.object({ title: RichText, text: z.string(), cta: ChatCta });

/* ---------- content.json ---------- */

export const ContentSchema = z.object({
  $schema: z.string().optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  locale: z.string(),
  dir: z.enum(["rtl", "ltr"]),
  seo: z.object({ title: z.string(), description: z.string(), ogImage: z.string().optional() }),
  contact: z.object({
    primary: z.enum(["whatsapp", "telegram", "messenger"]).default("whatsapp"),
    /** International format, digits only (e.g. 201001234567). */
    whatsapp: z.string().regex(/^\d{8,15}$/),
    telegram: z.string().optional(),
    messenger: z.string().optional(),
    phones: z.array(z.string()).default([]),
    /** Digit positions to color with the accent, like the printed flyers. */
    phoneHighlights: z.record(z.string(), z.array(z.number())).optional(),
    refCodes: z.boolean().default(true),
    refLabel: z.string().default("ref"),
  }),
  profile: z.object({
    name: z.string(),
    fullTitle: z.string(),
    latinName: z.string().optional(),
    role: z.string(),
    photo: z.string(),
    avatar: z.string().optional(),
    logo: z.string().optional(),
    photoBadge: z.string().optional(),
    replyNote: z.string().optional(),
  }),
  socials: z.array(z.object({
    type: z.enum(["youtube", "tiktok", "facebook", "instagram", "whatsappChannel", "telegram", "x"]),
    label: z.string(),
    url: z.string().url(),
  })).default([]),
  nav: z.array(LinkCta).default([]),
  navCta: ChatCta,
  sections: z.array(SectionKey).min(1),
  hero: Hero,
  grades: Grades.optional(),
  schedule: Schedule.optional(),
  method: Method.optional(),
  book: Book.optional(),
  students: Students.optional(),
  challenge: Challenge.optional(),
  exams: Exams.optional(),
  youtube: Youtube.optional(),
  final: Final.optional(),
  footer: z.object({ hashtags: z.array(z.string()).default([]) }).default({ hashtags: [] }),
  sticky: z.object({ secondary: LinkCta.optional(), cta: ChatCta }),
  labels: z.object({
    days: z.record(DayKey, z.string()),
    daysJoiner: z.string().default(" & "),
  }),
}).superRefine((c, ctx) => {
  for (const key of c.sections) {
    if (key !== "hero" && !c[key]) {
      ctx.addIssue({ code: "custom", path: ["sections"], message: `Section "${key}" is listed but has no data.` });
    }
  }
});

/* ---------- theme.json ---------- */

const Color = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);

export const ThemeSchema = z.object({
  $schema: z.string().optional(),
  name: z.string(),
  scheme: z.enum(["dark", "light"]),
  colors: z.object({
    bg: Color, surface: Color, raised: Color, line: Color,
    accent: Color, accentHot: Color, accentDeep: Color, onAccent: Color,
    text: Color, muted: Color, subtle: Color, online: Color,
  }),
  fonts: z.object({
    /** A Google Fonts css2 URL, or null to rely on the stacks below. */
    googleFontsHref: z.string().url().nullable(),
    display: z.string(),
    body: z.string(),
    numeric: z.string(),
  }),
  radius: z.object({ card: z.string(), control: z.string(), pill: z.string() }),
  options: z.object({
    texture: z.enum(["grain", "none"]).default("grain"),
    glow: z.boolean().default(true),
    heroPhotoShape: z.enum(["blob", "rounded", "circle"]).default("blob"),
    tagRotation: z.number().min(-8).max(8).default(-2),
    buttonGlow: z.boolean().default(true),
  }),
});

/* ---------- deploy.json ---------- */

export const DeploySchema = z.object({
  $schema: z.string().optional(),
  enabled: z.boolean(),
  /** Sub-path on the shared GitHub Pages site: <owner>.github.io/<repo>/<path>/ */
  githubPages: z.object({ path: z.string().regex(/^[a-z0-9-]+$/) }).nullable(),
  /** Custom domain for a dedicated host (Cloudflare etc.). Not used on GitHub Pages. */
  domain: z.string().nullable(),
});

export type Content = z.infer<typeof ContentSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type Deploy = z.infer<typeof DeploySchema>;
export type RichTextT = z.infer<typeof RichText>;
export type ChatCtaT = z.infer<typeof ChatCta>;
export type DayKeyT = z.infer<typeof DayKey>;
