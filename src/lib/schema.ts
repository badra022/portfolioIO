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

/**
 * Id of a form from content.forms. When set on a button, the button opens that
 * form (the student leaves their details for the teacher) instead of WhatsApp.
 */
const FormRef = z.string().meta({ widget: "form" });

/** A call to action that opens a chat with a pre-written message (or a form, see FormRef). */
export const ChatCta = z.object({
  label: z.string(),
  message: z.string(),
  /** Short code appended to the message so the team knows which button was used. */
  ref: z.string().optional(),
  form: FormRef.optional(),
});

export const LinkCta = z.object({ label: z.string(), href: z.string() });

/**
 * A button that can go anywhere, not only the teacher's main WhatsApp:
 * another WhatsApp number, Telegram, Messenger, a phone call or a web page.
 */
export const Action = z.object({
  label: z.string(),
  type: z.enum(["whatsapp", "telegram", "messenger", "phone", "link"]).default("whatsapp"),
  /** WhatsApp number (empty = the site's number), Telegram/Messenger username, phone number, or https link. */
  to: z.string().optional(),
  /** Pre-written message (WhatsApp and Telegram only). */
  message: z.string().optional(),
  ref: z.string().optional(),
  form: FormRef.optional(),
}).superRefine((a, ctx) => {
  if (a.form) return; // opens the form; "to" isn't used
  const to = (a.to ?? "").trim();
  const bad = (message: string) => ctx.addIssue({ code: "custom", path: ["to"], message });
  if (a.type === "link" && !/^https?:\/\//.test(to)) bad("اكتب رابط كامل يبدأ بـ https://");
  if (a.type === "whatsapp" && to && !/^\d{8,15}$/.test(to)) bad("رقم واتساب دولي بأرقام فقط، مثل 201009719950. اتركه فارغاً لاستخدام رقم الموقع.");
  if ((a.type === "telegram" || a.type === "messenger") && !/^@?[\w.]{3,64}$/.test(to)) bad("اكتب اسم المستخدم فقط، بدون رابط.");
  if (a.type === "phone" && !/^\+?[\d\s-]{6,20}$/.test(to)) bad("اكتب رقم الهاتف.");
});

/** "2026-10-10" (the whole day, Cairo time) or "2026-10-10T18:00". */
const EndDate = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?)?$/, { error: "اختر التاريخ" }).meta({ widget: "date" });
/** Same format; a date alone means from the start of that day (Cairo). Empty = right away. */
const StartDate = EndDate;

/** A question on a form. Remembered answers (name, phone...) are filled in next time on the student's device. */
const FormField = z.object({
  /** Short English id, e.g. "name", "phone", "grade". The same id on two forms shares the remembered value. */
  id: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/, { error: "حروف إنجليزية صغيرة وأرقام و _ فقط، مثل phone" }),
  label: z.string(),
  type: z.enum(["text", "tel", "number", "select", "textarea"]).default("text"),
  required: z.boolean().default(true),
  /** Remember on the student's device and don't ask again (name, phone). Off for answers that change each time. */
  remember: z.boolean().default(true),
  /** Choices for "select". */
  options: z.array(z.string()).default([]),
  placeholder: z.string().optional(),
});

/** A form a button can open instead of WhatsApp. Submissions appear in the admin panel ("Requests"). */
export const LeadForm = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,40}$/, { error: "حروف إنجليزية صغيرة وأرقام وشرطة، مثل student-info" }),
  title: z.string(),
  intro: z.string().optional(),
  fields: z.array(FormField).min(1),
  submitLabel: z.string().default("إرسال"),
  successMessage: z.string().default("وصلتنا بياناتك، وهنكلمك قريب."),
}).superRefine((f, ctx) => {
  const seen = new Set<string>();
  f.fields.forEach((x, i) => {
    if (seen.has(x.id)) ctx.addIssue({ code: "custom", path: ["fields", i, "id"], message: "معرّف مكرر في نفس النموذج." });
    seen.add(x.id);
    if (x.type === "select" && x.options.length < 2) ctx.addIssue({ code: "custom", path: ["fields", i, "options"], message: "اكتب اختيارين على الأقل." });
  });
});

export const Social = z.object({
  type: z.enum(["youtube", "tiktok", "facebook", "instagram", "whatsappChannel", "telegram", "x"]),
  label: z.string(),
  url: z.string().url(),
  /** e.g. "+5,000". Shown in the YouTube section. */
  followers: z.string().optional(),
  /** One line on what students get there, e.g. "Revisions before every exam". */
  note: z.string().optional(),
});

/** A tenant file (photo, cover, logo...). Either a key inside the tenant's asset folder or an absolute URL. */
const ImageRef = z.string().min(1).meta({ widget: "image" });
const OptionalImageRef = z.string().meta({ widget: "image" });

const SectionHead = {
  eyebrow: z.string(),
  title: RichText,
  intro: z.string().optional(),
};

/** YouTube video id (11 chars) or any common YouTube link to one video. */
export const YOUTUBE_RE = /^(?:[\w\-]{11}|https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[\w\-]{11}(?:[?&#][^\s]*)?)$/;

export const DayKey = z.enum(["sat", "sun", "mon", "tue", "wed", "thu", "fri"]);

/* ---------- sections ---------- */

export const SectionKey = z.enum([
  "hero", "grades", "schedule", "method", "book",
  "students", "reviews", "challenge", "exams", "youtube", "services", "final",
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
  filters: z.object({
    stage: z.boolean().default(true),
    day: z.boolean().default(true),
    /** Filter by area. Only shows when groups are in more than one area. */
    area: z.boolean().default(false),
  }),
  labels: z.object({
    all: z.string(), stage: z.string(), day: z.string(),
    area: z.string().optional(),
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
    time: z.string().regex(/^\d{2}:\d{2}$/, { error: "اختر الساعة" }).nullable(),
    mode: z.string().optional(),
    /** Where this group meets. Empty = the section's default location. */
    area: z.string().optional(),
    center: z.string().optional(),
  })),
  messages: z.object({ book: z.string(), ask: z.string() }),
  /** Booking buttons open this form instead of WhatsApp (the group's details are attached). */
  form: FormRef.optional(),
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
  cover: ImageRef,
  backCover: OptionalImageRef.optional(),
  coverAlt: z.string(),
  /** Inside pages shown under the cover, so students see the style of the book. */
  pagesTitle: z.string().optional(),
  pages: z.array(z.object({ image: ImageRef, alt: z.string() })).default([]),
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
    form: FormRef.optional(),
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
  photo: OptionalImageRef.nullable(),
  /** Photos of the teacher with students (classes, trips, matches). */
  gallery: z.array(z.object({ image: ImageRef, caption: z.string().optional() })).default([]),
  cta: ChatCta,
});

const Challenge = z.object({
  ...SectionHead,
  sendLabel: z.string(),
  /** Highlighted prize line, e.g. what a correct answer on WhatsApp wins. Also available as {prize} in the message. */
  prize: z.string().optional(),
  message: z.string(),
  /** Answers go to this form (question and chosen answer attached) instead of WhatsApp. */
  form: FormRef.optional(),
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
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?)?$/, { error: "اختر تاريخ الامتحان" }),
    featured: z.boolean().optional(),
    place: z.string().optional(),
    fee: z.string().optional(),
    prize: z.string().optional(),
    tracks: z.array(z.object({ id: z.string(), label: z.string(), scope: z.string() })).min(1),
    cta: z.string(),
    message: z.string(),
    form: FormRef.optional(),
  })),
  /** Top announcement bar for the featured exam. {date} is filled in. */
  announcement: z.string().optional(),
  /** The bar starts showing on this date. Empty = right away. */
  announcementStarts: StartDate.optional(),
  /** The bar stops showing after this date (it also goes once the featured exam's day is over). */
  announcementEnds: EndDate.optional(),
});

const Youtube = z.object({
  ...SectionHead,
  channelName: z.string(),
  channelUrl: z.string().url(),
  subscribeLabel: z.string(),
  /** Social links (from the site's social list) shown as cards with followers and a one-liner. */
  showSocials: z.boolean().default(true),
  socialsTitle: z.string().optional(),
  /** Headline number across all platforms, e.g. "+5,000". */
  followersTotal: z.string().optional(),
  followersLabel: z.string().optional(),
  videos: z.array(z.object({
    /** Video id or full YouTube link. */
    id: z.string().regex(YOUTUBE_RE, { error: "الصق رابط فيديو يوتيوب، مثل https://www.youtube.com/watch?v=..." }),
    title: z.string(),
    caption: z.string().optional(),
  })).default([]),
});

const Final = z.object({ title: RichText, text: z.string(), cta: ChatCta });

/** Students' feedback: screenshots of messages/reviews under a headline number. */
const Reviews = z.object({
  ...SectionHead,
  metric: z.object({ value: z.string(), label: z.string() }).optional(),
  stars: z.boolean().default(true),
  images: z.array(z.object({ image: ImageRef, alt: z.string().optional() })).default([]),
  moreLabel: z.string().default("عرض كل الآراء"),
});

/** Other services the teacher offers, each with its own button and links. */
const Services = z.object({
  ...SectionHead,
  items: z.array(z.object({
    title: z.string(),
    text: z.string(),
    image: OptionalImageRef.optional(),
    cta: Action.optional(),
    socials: z.array(Social).default([]),
  })).default([]),
});

/** Announcement shown over the page shortly after it opens. Not part of the section order. */
const Popup = z.object({
  enabled: z.boolean().default(true),
  title: z.string(),
  text: z.string().optional(),
  /** YouTube link played inside the pop-up (takes the place of the image). */
  video: z.string().regex(YOUTUBE_RE, { error: "الصق رابط فيديو يوتيوب" }).optional(),
  image: OptionalImageRef.optional(),
  cta: Action.optional(),
  /** Starts showing on this date. Empty = right away. */
  startsAt: StartDate.optional(),
  /** Stops showing after this date. */
  endsAt: EndDate.optional(),
  delaySeconds: z.number().min(0).max(60).default(2),
  /** After a visitor closes it, show it to them again after this many hours. */
  remindAfterHours: z.number().min(0).max(24 * 60).default(5),
});

/* ---------- content.json ---------- */

export const ContentSchema = z.object({
  $schema: z.string().optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/, { error: "حروف إنجليزية صغيرة وأرقام وشرطة فقط" }),
  locale: z.string(),
  dir: z.enum(["rtl", "ltr"]),
  seo: z.object({ title: z.string(), description: z.string(), ogImage: OptionalImageRef.optional() }),
  contact: z.object({
    primary: z.enum(["whatsapp", "telegram", "messenger"]).default("whatsapp"),
    /** International format, digits only (e.g. 201001234567). */
    whatsapp: z.string().regex(/^\d{8,15}$/, { error: "اكتب الرقم بالصيغة الدولية بأرقام فقط بدون + أو مسافات، مثل 201009719950" }),
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
    photo: ImageRef,
    avatar: OptionalImageRef.optional(),
    logo: OptionalImageRef.optional(),
    photoBadge: z.string().optional(),
    replyNote: z.string().optional(),
  }),
  socials: z.array(Social).default([]),
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
  reviews: Reviews.optional(),
  services: Services.optional(),
  final: Final.optional(),
  popup: Popup.optional(),
  forms: z.array(LeadForm).default([]),
  footer: z.object({ hashtags: z.array(z.string()).default([]) }).default({ hashtags: [] }),
  sticky: z.object({ secondary: LinkCta.optional(), cta: ChatCta }),
  labels: z.object({
    days: z.record(DayKey, z.string()),
    daysJoiner: z.string().default(" & "),
  }),
}).superRefine((c, ctx) => {
  const formIds = new Set<string>();
  c.forms.forEach((f, i) => {
    if (formIds.has(f.id)) ctx.addIssue({ code: "custom", path: ["forms", i, "id"], message: "معرّف نموذج مكرر." });
    formIds.add(f.id);
  });
  // Every button that points at a form must point at one that exists.
  const walk = (v: unknown, path: (string | number)[]) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, i]));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (k === "form" && typeof x === "string" && x && path[0] !== "forms" && !formIds.has(x)) {
          ctx.addIssue({ code: "custom", path: [...path, k], message: `النموذج "${x}" غير موجود. أضفه في قسم النماذج أو اختر واتساب.` });
        } else walk(x, [...path, k]);
      }
    }
  };
  walk(c, []);
  for (const key of c.sections) {
    if (key !== "hero" && !c[key]) {
      ctx.addIssue({ code: "custom", path: ["sections"], message: `القسم "${key}" ظاهر في ترتيب الأقسام لكن بياناته غير موجودة. أضف بياناته أو أخفِه.` });
    }
  }
});

/* ---------- theme.json ---------- */

const Color = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, { error: "لون غير صالح، مثل #e3171f" });

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
  /** Imported into the database by the platform console when true. */
  enabled: z.boolean(),
  /** Custom domains that serve this teacher (e.g. "mohamedali.com", "www.mohamedali.com"). First one is primary. */
  domains: z.array(z.string().regex(/^[a-z0-9.-]+$/)).default([]),
});

export type Content = z.infer<typeof ContentSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type Deploy = z.infer<typeof DeploySchema>;
export type RichTextT = z.infer<typeof RichText>;
export type ChatCtaT = z.infer<typeof ChatCta>;
export type ActionT = z.infer<typeof Action>;
export type LeadFormT = z.infer<typeof LeadForm>;
export type SocialT = z.infer<typeof Social>;
export type DayKeyT = z.infer<typeof DayKey>;
