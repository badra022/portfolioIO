import type { ChatConfig } from "@/lib/chat";
import type { Content } from "@/lib/schema";
import { Nav } from "./Nav";
import { Hero } from "./Hero";
import { Grades } from "./Grades";
import { Schedule } from "./Schedule";
import { Method } from "./Method";
import { Book } from "./Book";
import { Students } from "./Students";
import { Challenge } from "./Challenge";
import { Exams, upcomingExams } from "./Exams";
import { AnnouncementBar, type BarMessage } from "./AnnouncementBar";
import { dateParts } from "@/lib/format";
import type { PastExamItem } from "./ExamResults";
import { remembers } from "@/lib/lead";
import { deadline } from "@/lib/dates";
import { Youtube } from "./Youtube";
import { Final } from "./Final";
import { Reviews } from "./Reviews";
import { Services } from "./Services";
import { Featured } from "./Featured";
import { Honors } from "./Honors";
import { Faq } from "./Faq";
import { Popup } from "./Popup";
import { Tracker } from "./Tracker";
import { jsonLdScript, structuredData } from "@/lib/structured-data";
import { LeadForms } from "./LeadForms";
import { Complaints } from "./Complaints";
import { Footer, StickyBar } from "./Footer";
import { SectionMenu } from "./SectionMenu";
import { ChatButton } from "./ChatButton";
import { asset } from "@/lib/assets";
import { menuItems } from "@/lib/sections-meta";
import { ui } from "@/lib/i18n";
import { chatConfig } from "@/lib/chat";


/** Short stable hash, so editing the pop-up shows it again to visitors who closed the old one. */
function hash(value: unknown): string {
  let h = 5381;
  for (const ch of JSON.stringify(value)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** The ids the teacher's forms use for the student's name and phone, so remembered answers are shared. */
function contactIds(c: Content): { nameId: string; phoneId: string } {
  const kept = c.forms.flatMap((f) => f.fields).filter(remembers);
  const phoneId = kept.find((f) => f.type === "tel")?.id ?? "phone";
  const nameId = kept.find((f) => f.id === "name")?.id
    ?? kept.find((f) => f.type === "text" && /name|اسم/i.test(`${f.id} ${f.label}`))?.id
    ?? "name";
  return { nameId, phoneId };
}

/**
 * The red bar's messages, resolved for this page: {date} becomes the featured
 * upcoming exam's date (and the message ends with that exam's day; without one
 * it isn't shown), and the target becomes a link.
 */
function barMessages(c: Content, base: string): BarMessage[] {
  const featured = c.exams ? upcomingExams(c.exams).find((e) => e.featured) : undefined;
  return (c.bar?.items ?? []).flatMap((it): BarMessage[] => {
    let text = it.text.trim();
    let until = it.endsAt;
    if (text.includes("{date}")) {
      if (!featured) return [];
      text = text.replaceAll("{date}", dateParts(featured.date, c.locale).short);
      const examDay = featured.date.slice(0, 10);
      if (!until || deadline(examDay) < deadline(until)) until = examDay;
    }
    if (!text) return [];
    // A page of the site ("/exam-oct"), or a website typed with or without https://.
    const url = it.url?.trim();
    const external = !!url && !url.startsWith("/") && !url.startsWith("#");
    const href = url
      ? url.startsWith("/") ? `${base}${url}` : external && !/^https?:\/\//i.test(url) ? `https://${url}` : url
      : it.section && c.sections.includes(it.section) ? `#${it.section}` : undefined;
    return [{ text, icon: it.icon, href, external, from: it.startsAt, until }];
  });
}

/** The public teacher page. Content arrives with image URLs resolved and expired items (exams, pop-up) removed. */
export function TenantPage({ c, base, canonical, pastExams, preview = false }: { c: Content; base: string; canonical: string | null; pastExams: PastExamItem[]; preview?: boolean }) {
  const chat = chatConfig(c);
  const t = ui(c.locale);
  const results = { exams: pastExams, slug: c.slug, base, ...contactIds(c) };
  // Sections that have something to show (the others are skipped by their components too).
  const shown = (key: Content["sections"][number]) => {
    switch (key) {
      case "exams": return c.exams ? upcomingExams(c.exams).length > 0 || pastExams.length > 0 : false;
      case "services": return (c.services?.items.length ?? 0) > 0;
      case "featured": return (c.featured?.items.length ?? 0) > 0;
      case "honors": return (c.honors?.items ?? []).some((h) => h.name.trim());
      case "faq": return (c.faq?.items ?? []).some((q) => q.question.trim() && q.answer.trim());
      default: return true;
    }
  };
  const menu = c.menu.enabled ? menuItems(c, shown) : [];
  const hasMenu = menu.length >= 3;
  const render: Record<Content["sections"][number], () => React.ReactNode> = {
    hero: () => <Hero c={c} chat={chat} />,
    grades: () => <Grades data={c.grades!} />,
    schedule: () => (
      <Schedule
        data={c.schedule!}
        stages={(c.grades?.stages ?? []).map((s) => ({ id: s.id, name: s.name }))}
        dayLabels={c.labels.days}
        joiner={c.labels.daysJoiner}
        chat={chat}
      />
    ),
    method: () => <Method data={c.method!} />,
    book: () => <Book data={c.book!} chat={chat} />,
    students: () => <Students data={c.students!} chat={chat} />,
    challenge: () => <Challenge data={c.challenge!} chat={chat} />,
    exams: () => <Exams data={c.exams!} locale={c.locale} chat={chat} results={results} />,
    youtube: () => <Youtube data={c.youtube!} avatar={c.profile.avatar} socials={c.socials} />,
    reviews: () => <Reviews data={c.reviews!} />,
    services: () => <Services data={c.services!} chat={chat} />,
    featured: () => <Featured data={c.featured!} chat={chat} />,
    honors: () => <Honors data={c.honors!} chat={chat} />,
    faq: () => <Faq data={c.faq!} chat={chat} />,
    complaints: () => <Complaints data={c.complaints} base={base} />,
    final: () => <Final c={c} chat={chat} />,
  };

  return (
    <>
      {c.bar && <AnnouncementBar messages={barMessages(c, base)} />}
      <Nav c={c} chat={chat} menu={hasMenu} />
      {hasMenu && (
        <SectionMenu
          items={menu}
          title={c.menu.title}
          name={c.profile.fullTitle}
          avatar={c.profile.avatar ? asset(c.profile.avatar) : c.profile.photo ? asset(c.profile.photo) : undefined}
          cta={<ChatButton chat={chat} block label={c.navCta.label} message={c.navCta.message} refCode={c.navCta.ref} form={c.navCta.form} />}
        />
      )}
      <main>
        {c.sections.map((key, i) => (
          <div key={key} className={`section-slot slot-${key}`}>
            {i > 0 && key !== "final" && c.sections[i - 1] !== "hero" && <div className="divider" />}
            {render[key]()}
          </div>
        ))}
      </main>
      <Footer c={c} />
      <StickyBar c={c} chat={chat} />
      {/* Machine-readable description of the teacher, classes, exams, book and videos (lib/structured-data.ts). */}
      {!preview && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData(c, { canonical })) }} />}
      <Tracker slug={c.slug} base={base} preview={preview} />
      {c.forms.length > 0 && <LeadForms forms={c.forms} slug={c.slug} base={base} />}
      {c.popup && <Popup data={c.popup} chat={chat} storageKey={`popup:${c.slug}:${hash(c.popup)}`} closeLabel={t.close} />}
    </>
  );
}
