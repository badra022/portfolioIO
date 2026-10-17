import type { z } from "zod";
import { ContentSchema, type Content, type Theme } from "@/lib/schema";

/**
 * A ready-made site for a new teacher (the public «جرّب موقعك» form and the super
 * admin's «محتوى جاهز» option): the teacher's own name, photo, subject, videos,
 * phone and colors, and sample content everywhere else, so every part of the
 * platform can be tried right away: groups with each status, an exam with a
 * countdown, a self-graded quiz, a vote, a partner link, forms, the honor board,
 * the pop-up, the bar... Arabic or English. Images the teacher didn't send are
 * the generic illustrations in /public/demo.
 */
export type DemoInput = {
  slug: string;
  /** The teacher's name without a title, e.g. «كريم سامي». */
  name: string;
  /** «أ.», «م.», «د.», «مستر», «ميس», or "Mr." / "Ms." / "Dr." */
  title: string;
  subject: string;
  locale: "ar-EG" | "en";
  /** International digits, e.g. 201001234567. */
  whatsapp: string;
  slogan?: string;
  /** Up to three YouTube links. */
  videos?: string[];
  /** Stored image keys (or /demo/... paths). */
  photo?: string;
  logo?: string;
  /** Brand color (#rrggbb) and light or dark page. */
  color: string;
  scheme: "light" | "dark";
};

/** Real, stable sample videos for teachers who didn't give any (CrashCourse Physics). */
const SAMPLE_VIDEOS = ["https://www.youtube.com/watch?v=ZM8ECpBuQYE", "https://www.youtube.com/watch?v=ObHJJYvu3RE"];

const DAY = 86_400_000;
const day = (now: Date, plus: number) => new Date(now.getTime() + plus * DAY).toISOString().slice(0, 10);

/* ---------- colors ---------- */

const hex = (h: string) => {
  const s = h.replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const luminance = (h: string) => {
  const [r, g, b] = hex(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function demoTheme(color: string, scheme: "light" | "dark", name: string): Theme {
  const accent = /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : "#1D6FE0";
  const onAccent = luminance(accent) > 0.45 ? "#111111" : "#FFFFFF";
  const dark = scheme === "dark";
  const base = dark ? mix("#0B0B0E", accent, 0.06) : mix("#FFFFFF", accent, 0.03);
  return {
    name: `${name} — ${dark ? "dark" : "light"}`,
    scheme,
    colors: dark
      ? { bg: base, surface: mix(base, "#FFFFFF", 0.04), raised: mix(base, "#FFFFFF", 0.08), line: mix(base, "#FFFFFF", 0.16), accent, accentHot: mix(accent, "#FFFFFF", 0.18), accentDeep: mix(accent, "#000000", 0.45), onAccent, text: "#F3F4F7", muted: "#A8ADB8", subtle: "#7C818C", online: "#5BD08A" }
      : { bg: base, surface: "#FFFFFF", raised: mix(base, accent, 0.05), line: mix("#E4E7EC", accent, 0.08), accent, accentHot: mix(accent, "#000000", 0.12), accentDeep: mix(accent, "#000000", 0.35), onAccent, text: "#121826", muted: "#4B5565", subtle: "#6B7280", online: "#16A34A" },
    fonts: {
      googleFontsHref: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;700&family=Cairo:wght@600;800&display=swap",
      display: "\"Cairo\", \"IBM Plex Sans Arabic\", system-ui, sans-serif",
      body: "\"IBM Plex Sans Arabic\", \"Segoe UI\", Tahoma, system-ui, sans-serif",
      numeric: "\"Cairo\", \"IBM Plex Sans Arabic\", system-ui, sans-serif",
    },
    radius: { card: "16px", control: "12px", pill: "999px" },
    options: { texture: "none", glow: dark, heroPhotoShape: "rounded", tagRotation: -2, buttonGlow: dark },
  };
}

/* ---------- content ---------- */

export function buildDemo(input: DemoInput, now = new Date()): { content: Content; theme: Theme } {
  const en = input.locale === "en";
  const L = (ar: string, english: string) => (en ? english : ar);
  const who = `${input.title} ${input.name}`.trim();
  const subj = input.subject.trim() || L("الرياضيات", "Mathematics");
  const videos = (input.videos ?? []).map((v) => v.trim()).filter(Boolean).slice(0, 3);
  const vids = videos.length ? videos : SAMPLE_VIDEOS;
  const firstVideo = vids[0];
  const hello = L(`السلام عليكم ${who}، `, `Hello ${who}, `);
  const photo = input.photo || "/demo/teacher.svg";

  const days = en
    ? { sat: "Saturday", sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday" }
    : { sat: "السبت", sun: "الأحد", mon: "الاتنين", tue: "التلات", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة" };

  const g = en
    ? { s1: "Grade 10", s2: "Grade 11", s3: "Grade 12", p3: "Grade 9" }
    : { s1: "أولى ثانوي", s2: "تانية ثانوي", s3: "تالتة ثانوي", p3: "تالتة إعدادي" };
  const center = L("سنتر النخبة", "Elite Center");

  const bookingForm = {
    id: "booking",
    title: L("احجز مكانك", "Book your seat"),
    intro: L("سيب بياناتك وهنكلمك نأكد الحجز.", "Leave your details and we'll call you to confirm."),
    fields: [
      { id: "name", label: L("الاسم", "Name"), type: "text" as const, required: true, remember: true, options: [] },
      { id: "phone", label: L("رقم الموبايل", "Mobile number"), type: "tel" as const, required: true, remember: true, options: [] },
      { id: "grade", label: L("السنة الدراسية", "Grade"), type: "select" as const, required: true, remember: true, options: [g.p3, g.s1, g.s2, g.s3] },
      { id: "note", label: L("ملاحظة", "Note"), type: "textarea" as const, required: false, remember: false, options: [] },
    ],
    submitLabel: L("ابعت", "Send"),
    successMessage: L("وصلنا طلبك، وهنكلمك قريب.", "We got your request and will call you soon."),
  };
  const quizForm = {
    id: "quiz-info",
    title: L("بياناتك قبل الاختبار", "Your details before the quiz"),
    fields: [
      { id: "name", label: L("الاسم", "Name"), type: "text" as const, required: true, remember: true, options: [] },
      { id: "phone", label: L("رقم الموبايل", "Mobile number"), type: "tel" as const, required: true, remember: true, options: [] },
    ],
    submitLabel: L("ابدأ", "Start"),
    successMessage: L("بالتوفيق!", "Good luck!"),
  };

  const content: z.input<typeof ContentSchema> = {
    slug: input.slug,
    locale: input.locale,
    seo: {
      title: L(`${who} | ${subj}`, `${who} | ${subj}`),
      description: input.slogan || L(`${subj} مع ${who}: شرح بسيط، امتحانات كل أسبوع، ومتابعة لكل طالب. احجز مكانك.`, `${subj} with ${who}: clear lessons, weekly exams and follow-up for every student. Book your seat.`),
    },
    contact: { primary: "whatsapp", whatsapp: input.whatsapp, phones: [input.whatsapp.replace(/^20/, "0")], refCodes: true, refLabel: L("كود", "ref") },
    profile: {
      name: input.name,
      fullTitle: who,
      role: L(`مدرس ${subj}`, `${subj} teacher`),
      photo,
      avatar: input.photo || undefined,
      logo: input.logo || undefined,
      photoBadge: L("#ذاكر_صح", "#study_smart"),
      replyNote: L("بيرد على واتساب", "Replies on WhatsApp"),
    },
    socials: [
      { type: "youtube", label: "YouTube", url: "https://www.youtube.com/", followers: "+12K", note: L("شرح كل درس ومراجعات قبل الامتحان", "Every lesson plus revisions before exams") },
      { type: "facebook", label: "Facebook", url: "https://www.facebook.com/", followers: "+8K", note: L("مواعيد ونتايج وتنبيهات", "Schedules, results and news") },
      { type: "tiktok", label: "TikTok", url: "https://www.tiktok.com/", followers: "+20K", note: L("أفكار سريعة في دقيقة", "Quick ideas in a minute") },
    ],
    nav: [
      { label: L("المواعيد", "Schedule"), href: "#schedule" },
      { label: L("الامتحانات", "Exams"), href: "#exams" },
      { label: L("لوحة الشرف", "Honor board"), href: "#honors" },
    ],
    navCta: { label: L("كلمنا واتساب", "WhatsApp us"), message: `${hello}${L("عندي استفسار عن الحصص.", "I have a question about the classes.")}`, ref: "NAV" },
    sections: ["hero", "featured", "grades", "schedule", "method", "exams", "honors", "book", "students", "reviews", "challenge", "youtube", "services", "faq", "complaints", "final"],
    hero: {
      kicker: `${who} · ${L(`مدرس ${subj}`, `${subj} teacher`)}`,
      headline: input.slogan
        ? [[{ text: input.slogan, style: "accent" }]]
        : [[{ text: L("ذاكر ", "Learn ") }, { text: subj, style: "accent" }], [{ text: L("صح، ", "the right way, ") }, { text: L("واقفل الامتحان", "ace the exam"), style: "tag" }]],
      lede: [{ text: L("شرح بأبسط طريقة لـ", "Clear lessons for ") }, { text: L("إعدادي وثانوي", "middle and high school"), style: "strong" }, { text: L("، امتحان كل أسبوع، ومتابعة لولي الأمر.", ", a quiz every week, and updates for parents.") }],
      primaryCta: { label: L("احجز مكانك", "Book your seat"), message: `${hello}${L("عايز أحجز مكان في الحصص.", "I'd like to book a seat.")}`, ref: "HERO", form: "booking" },
      secondaryCta: { label: L("شوف المواعيد", "See the schedule"), href: "#schedule" },
      stats: [
        { value: "1200", prefix: "+", label: L("طالب معانا", "students") },
        { value: "12", label: L("سنة خبرة", "years of experience") },
        { value: "98", prefix: "%", label: L("نسبة النجاح", "pass rate") },
      ],
    },
    featured: {
      eyebrow: L("عروض", "Offers"),
      title: [{ text: L("عرض ", "Limited ") }, { text: L("لفترة محدودة", "time offer"), style: "accent" }],
      intro: L("مثال على قسم العروض: كورس، سعر، وعداد تنازلي.", "A sample offer: a course, a price and a countdown."),
      display: "auto",
      items: [
        {
          badge: L("عرض الترم", "Term offer"),
          title: L(`كورس المراجعة النهائية في ${subj}`, `Final revision course in ${subj}`),
          text: L("8 حصص مراجعة شاملة + بنك أسئلة + امتحانين تجريبيين.", "8 full revision classes, a question bank and two mock exams."),
          video: firstVideo,
          points: [L("مذكرة مراجعة مطبوعة", "Printed revision notes"), L("حل نماذج امتحانات السنين اللي فاتت", "Past exam papers solved"), L("متابعة على واتساب", "Follow-up on WhatsApp")],
          price: L("450 جنيه", "EGP 450"),
          oldPrice: L("600 جنيه", "EGP 600"),
          priceNote: L("للحجز قبل نهاية العرض", "when you book before the offer ends"),
          endsAt: day(now, 9),
          countdown: true,
          cta: { label: L("احجز العرض", "Book the offer"), type: "whatsapp", message: `${hello}${L("عايز أحجز عرض المراجعة النهائية.", "I'd like the final revision offer.")}` },
        },
      ],
    },
    grades: {
      eyebrow: L("الصفوف", "Grades"),
      title: [{ text: L("بدرّس ", "I teach ") }, { text: L("مين؟", "who?"), style: "accent" }],
      stages: [
        { id: "prep", name: L("إعدادي", "Middle school"), items: [{ name: g.p3, subject: subj }] },
        { id: "sec", name: L("ثانوي", "High school"), note: L("منهج كامل + مراجعات", "Full curriculum + revisions"), items: [{ name: g.s1, subject: subj }, { name: g.s2, subject: subj }, { name: g.s3, subject: subj }] },
      ],
    },
    schedule: {
      eyebrow: L("المواعيد", "Schedule"),
      title: [{ text: L("اختار ", "Pick ") }, { text: L("مجموعتك", "your group"), style: "accent" }, { text: L(" واحجز", " and book") }],
      intro: L("مثال على الجدول: كل مجموعة بحالتها (فيها أماكن، كاملة، أو لسه مبدأتش).", "A sample schedule: every group with its status (seats left, full, or starting soon)."),
      location: center,
      filters: { stage: true, day: true, area: true },
      labels: en
        ? { all: "All", stage: "Stage", day: "Day", area: "Area", pm: "pm", am: "am", tbd: "Time to be announced", empty: "No groups on this day. Message us and we'll find you one.", book: "Book this group", ask: "Ask about the time", available: "Seats left", full: "Full", notStarted: "Starting soon", startsOn: "Starts", waitlist: "Join the waiting list", reserve: "Reserve early" }
        : { all: "الكل", stage: "المرحلة", day: "اليوم", area: "المنطقة", pm: "م", am: "ص", tbd: "الموعد هيتعلن قريب", empty: "مفيش مجموعات في اليوم ده. ابعتلنا ونلاقيلك أقرب موعد.", book: "احجز المجموعة دي", ask: "اسأل عن الموعد" },
      slots: [
        { id: "S3A", grade: g.s3, subject: subj, stage: "sec", days: ["sat", "tue"], time: "16:00", area: L("مدينة نصر", "Nasr City"), center, status: "available" },
        { id: "S3B", grade: g.s3, subject: subj, stage: "sec", days: ["sun", "wed"], time: "18:00", area: L("مدينة نصر", "Nasr City"), center, status: "full" },
        { id: "S2A", grade: g.s2, subject: subj, stage: "sec", days: ["mon", "thu"], time: "15:00", area: L("المعادي", "Maadi"), center: L("سنتر الأوائل", "Top Center") },
        { id: "S1A", grade: g.s1, subject: subj, stage: "sec", days: ["sat"], time: "13:00", area: L("المعادي", "Maadi"), center: L("سنتر الأوائل", "Top Center"), status: "notStarted", startsOn: day(now, 14) },
        { id: "P3A", grade: g.p3, subject: subj, stage: "prep", days: ["fri"], time: null, mode: L("أونلاين", "Online") },
      ],
      messages: {
        book: L("السلام عليكم، عايز أحجز مجموعة {grade} ({subject}) يوم {days} الساعة {time} في {location}.", "Hello, I'd like to book the {grade} ({subject}) group on {days} at {time} in {location}."),
        ask: L("السلام عليكم، عايز أعرف ميعاد مجموعة {grade} ({subject}).", "Hello, when is the {grade} ({subject}) group?"),
        ...(en ? { waitlist: "Hello, the {grade} ({subject}) group on {days} at {time} is full. Can you put me on the waiting list?", reserve: "Hello, I'd like to reserve a seat in the {grade} ({subject}) group starting {start}." } : {}),
      },
      form: "booking",
    },
    method: {
      eyebrow: L("طريقتي", "My method"),
      title: [{ text: L("ليه الطلاب ", "Why students ") }, { text: L("بيقفلوا", "score high"), style: "accent" }],
      display: "auto",
      items: [
        { icon: "book", title: L("شرح من الصفر", "From the basics"), text: L("كل درس بيبدأ من الفكرة لحد أصعب سؤال.", "Every lesson starts from the idea and ends with the hardest question.") },
        { icon: "check", title: L("امتحان كل أسبوع", "A quiz every week"), text: L("تعرف مستواك أول بأول، وولي الأمر يتابع.", "Know where you stand every week, and so do your parents.") },
        { icon: "chat", title: L("رد على واتساب", "Answers on WhatsApp"), text: L("اسأل في أي وقت وهترد عليك.", "Ask anytime and get an answer.") },
        { icon: "trophy", title: L("جوايز للأوائل", "Prizes for the top"), text: L("مسابقات وجوايز كل شهر.", "Competitions and prizes every month.") },
      ],
    },
    exams: {
      eyebrow: L("الامتحانات", "Exams"),
      title: [{ text: L("امتحن مع ", "Take the exam with ") }, { text: L("مئات الطلاب", "hundreds of students"), style: "accent" }],
      intro: L("مثال على امتحان عام بعداد تنازلي وجايزة للأوائل.", "A sample open exam with a countdown and prizes."),
      display: "auto",
      labels: en
        ? { scope: "Covers", prize: "Prize", trackLabel: "Choose your grade", countdown: "Starts in", days: "days", hours: "hours", minutes: "minutes", today: "Today!" }
        : { scope: "على", prize: "الجايزة", trackLabel: "اختار سنتك", countdown: "باقي", days: "يوم", hours: "ساعة", minutes: "دقيقة", today: "النهاردة!" },
      items: [
        {
          id: "EX1", title: L("امتحان الشهر", "Monthly exam"), date: day(now, 10), featured: true, place: center,
          fee: L("50 جنيه", "EGP 50"), prize: L("جوايز للعشرة الأوائل", "Prizes for the top ten"),
          tracks: [{ id: "s3", label: g.s3, scope: L("الباب الأول والتاني", "Units 1 and 2") }, { id: "s2", label: g.s2, scope: L("الباب الأول", "Unit 1") }],
          cta: L("احجز في الامتحان", "Book the exam"),
          message: L("السلام عليكم، عايز أحجز في امتحان {date}. سنتي: {track} (على {scope}).", "Hello, I'd like to book the exam on {date}. My grade: {track} ({scope})."),
        },
        {
          id: "EX2", title: L("امتحان شامل", "Full mock exam"), date: day(now, 24), place: center,
          tracks: [{ id: "all", label: L("كل السنين", "All grades"), scope: L("المنهج كله", "Whole curriculum") }],
          cta: L("احجز في الامتحان", "Book the exam"),
          message: L("السلام عليكم، عايز أحجز في الامتحان الشامل يوم {date}.", "Hello, I'd like to book the mock exam on {date}."),
        },
      ],
      resultsLabel: L("نتايج الامتحانات اللي فاتت", "Results of past exams"),
    },
    honors: {
      eyebrow: L("لوحة الشرف", "Honor board"),
      title: [{ text: L("أوائل ", "Our top ") }, { text: L("طلابنا", "students"), style: "accent" }],
      intro: L("أسماء وصور تجريبية: استبدلها بأوائل طلابك.", "Sample names and photos: replace them with your own top students."),
      display: "auto",
      items: [
        { name: L("سلمى إبراهيم", "Salma Ibrahim"), score: "50/50", grade: `${g.s3} · 2026`, icon: "crown", images: [{ image: "/demo/student-1.svg", alt: "" }], highlights: [{ icon: "trophy", text: L("الأولى على المدرسة", "First in her school") }, { icon: "star", text: L("الدرجة النهائية", "Full mark") }], description: L("التزمت بكل الامتحانات الأسبوعية من أول السنة، وده كان سر الدرجة النهائية.", "She took every weekly quiz from day one, and that was the secret behind the full mark.") },
        { name: L("عمر خالد", "Omar Khaled"), score: "49/50", grade: `${g.s3} · 2026`, icon: "medal", images: [{ image: "/demo/student-2.svg", alt: "" }], highlights: [{ icon: "bolt", text: L("أعلى تحسن في الترم", "Biggest improvement of the term") }], video: firstVideo },
        { name: L("مريم حسن", "Mariam Hassan"), score: "98%", grade: `${g.s2} · 2026`, icon: "star", images: [{ image: "/demo/student-3.svg", alt: "" }] },
      ],
      cta: { label: L("احجز مكانك واكتب اسمك هنا السنة الجاية", "Book your seat and be here next year"), type: "whatsapp", message: `${hello}${L("عايز أحجز مكان.", "I'd like to book a seat.")}` },
    },
    book: {
      eyebrow: L("الكتاب", "The book"),
      title: [{ text: L("كتاب ", "The ") }, { text: subj, style: "accent" }, { text: L(" الخاص", " book") }],
      intro: L("مثال على قسم الكتاب: الغلاف، صفحات من جوه، وطلب على واتساب.", "A sample book section: cover, inside pages and ordering on WhatsApp."),
      seriesName: L("سلسلة النجاح", "Success series"),
      cover: "/demo/book-cover.svg",
      coverAlt: L("غلاف الكتاب", "Book cover"),
      pagesTitle: L("من جوه الكتاب", "Inside the book"),
      pages: [{ image: "/demo/book-page-1.svg", alt: L("صفحة شرح", "Lesson page") }, { image: "/demo/book-page-2.svg", alt: L("صفحة أسئلة", "Questions page") }],
      features: [{ value: "2000", label: L("سؤال", "questions") }, { value: "12", label: L("امتحان كامل", "full exams") }, { value: "100%", label: L("إجابات بالشرح", "answers explained") }],
      order: {
        title: L("اطلب الكتاب", "Order the book"),
        gradeLabel: L("السنة", "Grade"),
        deliveryLabel: L("الاستلام", "Delivery"),
        grades: [g.s1, g.s2, g.s3],
        delivery: [{ id: "center", label: L("من السنتر", "From the center"), value: L("استلام من السنتر", "Pick up at the center") }, { id: "home", label: L("توصيل للبيت", "Home delivery"), value: L("توصيل للبيت", "Home delivery") }],
        cta: L("اطلب على واتساب", "Order on WhatsApp"),
        message: L("السلام عليكم، عايز أطلب الكتاب. السنة: {grade}، الاستلام: {delivery}.", "Hello, I'd like to order the book. Grade: {grade}, delivery: {delivery}."),
      },
    },
    students: {
      eyebrow: L("طلابنا", "Our students"),
      count: "1200",
      prefix: "+",
      title: [{ text: L("عيلة ", "A family of ") }, { text: L("كبيرة", "learners"), style: "accent" }],
      text: L("صور تجريبية من الحصص والرحلات: استبدلها بصورك.", "Sample photos from classes and trips: replace them with yours."),
      photo: "/demo/class-1.svg",
      gallery: [{ image: "/demo/class-2.svg", caption: L("حصة مراجعة", "Revision class") }, { image: "/demo/class-3.svg", caption: L("رحلة آخر السنة", "End-of-year trip") }],
      cta: { label: L("انضم لينا", "Join us"), message: `${hello}${L("عايز أنضم للحصص.", "I'd like to join the classes.")}`, ref: "STUDENTS" },
    },
    reviews: {
      eyebrow: L("آراء الطلاب", "Reviews"),
      title: [{ text: L("قالوا ", "What they ") }, { text: L("إيه؟", "say"), style: "accent" }],
      display: "auto",
      metric: { value: "4.9", label: L("تقييم الطلاب وأولياء الأمور", "rating from students and parents") },
      stars: true,
      images: [{ image: "/demo/review-1.svg", alt: L("رسالة طالب", "A student's message") }, { image: "/demo/review-2.svg", alt: L("رسالة ولي أمر", "A parent's message") }, { image: "/demo/review-3.svg", alt: L("رسالة طالب", "A student's message") }],
      moreLabel: L("عرض كل الآراء", "Show all reviews"),
    },
    challenge: {
      eyebrow: L("التحدي", "Challenge"),
      title: [{ text: L("تقدر ", "Can you ") }, { text: L("تحلها؟", "solve it?"), style: "accent" }],
      intro: L("اختار إجابتك وابعتها، والمدرس يرد عليك.", "Pick your answer and send it; the teacher replies."),
      sendLabel: L("ابعت إجابتك", "Send your answer"),
      prize: L("أول 3 إجابات صح ليهم حصة مجانية", "The first 3 right answers win a free class"),
      message: L("حليت سؤال التحدي رقم {n} من الموقع، وإجابتي: {answer}", "I solved challenge question {n} on the site. My answer: {answer}"),
      questions: [
        { level: L("سؤال سهل", "Easy"), question: L("لو 3س = 12، يبقى س تساوي:", "If 3x = 12, then x equals:"), options: ["3", "4", "6", "9"], draft: true },
        { level: L("سؤال صعب", "Hard"), question: L("عربية سرعتها 72 كم/س. سرعتها بالمتر في الثانية:", "A car moves at 72 km/h. Its speed in m/s is:"), options: ["7.2", "20", "36", "72"], draft: true },
      ],
    },
    youtube: {
      eyebrow: L("الفيديوهات", "Videos"),
      title: [{ text: L("اتفرج ", "Watch ") }, { text: L("واتعلم", "and learn"), style: "accent" }],
      intro: videos.length ? undefined : L("فيديوهات تجريبية: ضيف فيديوهاتك من لوحة التحكم.", "Sample videos: add your own from the admin panel."),
      display: "auto",
      channelName: who,
      channelUrl: "https://www.youtube.com/",
      subscribeLabel: L("اشترك في القناة", "Subscribe"),
      showSocials: true,
      socialsTitle: L("تابعني على", "Follow me on"),
      followersTotal: "+40K",
      followersLabel: L("متابع على كل المنصات", "followers across platforms"),
      videos: vids.map((id, i) => ({ id, title: L(`فيديو ${i + 1}`, `Video ${i + 1}`) })),
    },
    services: {
      eyebrow: L("خدمات أخرى", "More services"),
      title: [{ text: L("كمان ", "Also ") }, { text: L("عندنا", "available"), style: "accent" }],
      display: "auto",
      items: [
        { title: L("حصص أونلاين", "Online classes"), text: L("نفس الشرح من البيت، بمواعيد مرنة.", "The same classes from home, at flexible times."), image: "/demo/service.svg", cta: { label: L("اسأل عن الأونلاين", "Ask about online"), type: "whatsapp", message: `${hello}${L("عايز أعرف عن الحصص الأونلاين.", "I'd like to know about online classes.")}` } },
        { title: L("مجموعات خاصة", "Private groups"), text: L("مجموعة صغيرة لـ 5 طلاب بس.", "Small groups of up to 5 students."), cta: { label: L("احجز مجموعة خاصة", "Book a private group"), type: "link", to: "https://wa.me/" + input.whatsapp } },
      ],
    },
    faq: {
      eyebrow: L("أسئلة شائعة", "FAQ"),
      title: [{ text: L("عندك ", "Got a ") }, { text: L("سؤال؟", "question?"), style: "accent" }],
      items: [
        { question: L("إزاي أحجز في مجموعة؟", "How do I book a group?"), answer: L("اختار المجموعة من الجدول ودوس احجز، أو كلمنا على واتساب.", "Pick a group in the schedule and tap book, or message us on WhatsApp.") },
        { question: L("فيه حصص أونلاين؟", "Are there online classes?"), answer: L("أيوه، فيه مجموعات أونلاين لكل السنين.", "Yes, there are online groups for every grade.") },
        { question: L("إزاي أعرف نتيجتي؟", "How do I see my result?"), answer: L("من «نتايج الامتحانات» تحت الامتحانات، باسمك ورقم موبايلك.", "From «Results of past exams» under the exams, with your name and mobile number.") },
      ],
      openFirst: true,
      moreText: L("لسه عندك سؤال؟", "Still have a question?"),
      cta: { label: L("اسألنا على واتساب", "Ask us on WhatsApp"), type: "whatsapp", message: `${hello}${L("عندي سؤال: ", "I have a question: ")}` },
    },
    complaints: { categories: en ? ["Lessons", "Schedule", "Center", "Something else"] : ["الشرح", "المواعيد", "السنتر", "حاجة تانية"] },
    final: {
      title: [{ text: L("إحنا ", "We're ") }, { text: L("معاك", "with you"), style: "accent" }, { text: L(" لحد الامتحان", " all the way") }],
      text: L("ابعت سؤالك أو احجز مكانك، وهنرد عليك على طول.", "Send your question or book your seat, and we'll reply right away."),
      cta: { label: L("ابعت رسالة على واتساب", "Message us on WhatsApp"), message: `${hello}${L("عندي سؤال: ", "I have a question: ")}`, ref: "FINAL" },
    },
    popup: {
      enabled: true,
      title: L("الحجز مفتوح للترم الجديد", "Booking is open for the new term"),
      text: L("ده مثال على الإعلان المنبثق: بيظهر مرة لكل زائر وليه تاريخ انتهاء.", "This is a sample pop-up: it shows once per visitor and has an end date."),
      video: firstVideo,
      cta: { label: L("احجز مكانك", "Book your seat"), type: "whatsapp", form: "booking" },
      endsAt: day(now, 30),
      delaySeconds: 4,
      remindAfterHours: 12,
    },
    bar: {
      items: [
        { text: L("امتحان الشهر يوم {date}: احجز مكانك", "Monthly exam on {date}: book your seat"), icon: "trophy", section: "exams" },
        { text: L("جرّب الاختبار التجريبي واعرف درجتك على طول", "Try the sample quiz and get your grade instantly"), icon: "bolt", url: "/sample-quiz" },
      ],
    },
    menu: { enabled: true, title: L("محتوى الصفحة", "On this page"), items: [] },
    forms: [bookingForm, quizForm],
    quizzes: [
      {
        path: "sample-quiz", title: L("اختبار تجريبي (بيتصحح على طول)", "Sample quiz (graded instantly)"),
        intro: L("5 أسئلة في 10 دقايق. هتعرف درجتك والإجابات الصح أول ما تسلّم.", "5 questions in 10 minutes. You'll see your grade and the right answers as soon as you hand in."),
        form: "quiz-info", durationMinutes: 10, state: "open", passPercent: 50, selfGrading: true, showCorrect: true,
        resultMessage: L("عايز تقفل الامتحان؟ احجز حصة تجريبية مجاناً.", "Want a top grade? Book a free trial class."),
        resultCta: { label: L("احجز حصة تجريبية", "Book a trial class"), type: "whatsapp", form: "booking" },
        startLabel: L("ابدأ الاختبار", "Start the quiz"), submitLabel: L("سلّم الإجابات", "Hand in"), doneMessage: L("تم التسليم!", "Handed in!"), indexable: false,
        questions: [
          { text: L("2 + 3 × 4 = ؟", "2 + 3 × 4 = ?"), type: "choice", options: ["14", "20", "24"], correct: ["14"], points: 1 },
          { text: L("نص الـ 50 كام؟", "What is half of 50?"), type: "choice", options: ["20", "25", "30"], correct: ["25"], points: 1 },
          { text: L("عدد أيام الأسبوع؟", "How many days in a week?"), type: "text", options: [], correct: ["7", L("سبعة", "seven")], points: 1 },
          { text: L("10% من 200 = ؟", "10% of 200 = ?"), type: "choice", options: ["2", "20", "200"], correct: ["20"], points: 1 },
          { text: L("أكبر رقم:", "The biggest number:"), type: "choice", options: ["0.5", "0.45", "0.09"], correct: ["0.5"], points: 1 },
        ],
      },
      {
        path: "monthly-quiz", title: L("اختبار الشهر (المدرس بيصححه)", "Monthly quiz (graded by the teacher)"),
        intro: L("الدرجة بتوصلك بعد ما المدرس يراجعها، وتلاقيها في «نتايج الامتحانات».", "Your grade arrives after the teacher reviews it, in «Results of past exams»."),
        form: "quiz-info", durationMinutes: 20, state: "open", passPercent: 50, selfGrading: false, showCorrect: true,
        startLabel: L("ابدأ الاختبار", "Start the quiz"), submitLabel: L("سلّم الإجابات", "Hand in"), doneMessage: L("تم تسليم إجاباتك. بالتوفيق!", "Your answers were handed in. Good luck!"), indexable: false,
        questions: [
          { text: L(`اشرح في سطرين أهم فكرة في أول درس ${subj}.`, `In two lines, explain the main idea of the first ${subj} lesson.`), type: "text", options: [], correct: [], points: 5 },
          { text: L("5 × 6 = ؟", "5 × 6 = ?"), type: "choice", options: ["11", "30", "56"], correct: ["30"], points: 1 },
        ],
      },
    ],
    polls: [
      {
        path: "sample-vote", title: L("تحب الجايزة الجاية تبقى إيه؟", "What should the next prize be?"),
        description: L("تصويت تجريبي من غير اسم ولا رقم. شاركه ستوري!", "A sample anonymous vote. Share it in your story!"),
        images: [], choices: [{ label: L("سماعة بلوتوث", "Wireless earbuds") }, { label: L("كتاب مجاني", "A free book") }, { label: L("رحلة", "A trip") }],
        durationHours: 0, state: "open", submitLabel: L("ابعت صوتك", "Send your vote"), doneMessage: L("شكراً! صوتك اتسجل.", "Thanks! Your vote counts."), showResults: true,
      },
    ],
    referrals: [{ code: "sample-partner", name: L("شريك تجريبي", "Sample partner"), note: L("مثال: 10 جنيه على كل حجز", "Example: EGP 10 per booking") }],
    footer: { hashtags: [L("#ذاكر_صح", "#study_smart")] },
    sticky: { secondary: { label: L("المواعيد", "Schedule"), href: "#schedule" }, cta: { label: L("واتساب", "WhatsApp"), message: `${hello}${L("عايز أستفسر عن الحصص.", "I have a question about the classes.")}`, ref: "STICKY" } },
    labels: { days, daysJoiner: L(" و", " & ") },
  };
  return { content: ContentSchema.parse(content), theme: demoTheme(input.color, input.scheme, who) };
}

/** The links worth opening on a new demo site, for the «your site is ready» page. */
export function demoLinks(base: string, locale: "ar-EG" | "en") {
  const en = locale === "en";
  const L = (ar: string, english: string) => (en ? english : ar);
  return [
    { label: L("موقعك", "Your site"), href: `${base}/` },
    { label: L("اختبار بيتصحح على طول", "Instantly graded quiz"), href: `${base}/sample-quiz` },
    { label: L("اختبار المدرس بيصححه", "Teacher-graded quiz"), href: `${base}/monthly-quiz` },
    { label: L("تصويت من غير اسم", "Anonymous vote"), href: `${base}/sample-vote` },
    { label: L("رابط شريك (تسويق بالعمولة)", "Partner (affiliate) link"), href: `${base}/?ref=sample-partner` },
    { label: L("الامتحانات والنتايج", "Exams and results"), href: `${base}/#exams` },
    { label: L("صندوق الشكاوى", "Complaints box"), href: `${base}/#complaints` },
    { label: L("لوحة التحكم", "Admin panel"), href: `${base}/admin` },
  ];
}
