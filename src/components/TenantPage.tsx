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
import { Announcement, Exams } from "./Exams";
import { Youtube } from "./Youtube";
import { Final } from "./Final";
import { Reviews } from "./Reviews";
import { Services } from "./Services";
import { Popup } from "./Popup";
import { DevCredit } from "./DevCredit";
import { Tracker } from "./Tracker";
import { LeadForms } from "./LeadForms";
import { Footer, StickyBar } from "./Footer";

function chatConfig(c: Content): ChatConfig {
  const { primary, whatsapp, telegram, messenger, refCodes, refLabel } = c.contact;
  return { primary, whatsapp, telegram, messenger, refCodes, refLabel };
}

/** Short stable hash, so editing the pop-up shows it again to visitors who closed the old one. */
function hash(value: unknown): string {
  let h = 5381;
  for (const ch of JSON.stringify(value)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** The public teacher page. Content arrives with image URLs resolved and expired items (exams, pop-up) removed. */
export function TenantPage({ c, base }: { c: Content; base: string }) {
  const chat = chatConfig(c);
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
    exams: () => <Exams data={c.exams!} locale={c.locale} chat={chat} />,
    youtube: () => <Youtube data={c.youtube!} avatar={c.profile.avatar} socials={c.socials} />,
    reviews: () => <Reviews data={c.reviews!} />,
    services: () => <Services data={c.services!} chat={chat} />,
    final: () => <Final c={c} chat={chat} />,
  };

  return (
    <>
      {c.exams && <Announcement data={c.exams} locale={c.locale} />}
      <Nav c={c} chat={chat} />
      <main>
        {c.sections.map((key, i) => (
          <div key={key} className={`section-slot slot-${key}`}>
            {i > 0 && key !== "final" && c.sections[i - 1] !== "hero" && <div className="divider" />}
            {render[key]()}
          </div>
        ))}
      </main>
      <Footer c={c} />
      <DevCredit siteName={c.profile.fullTitle} />
      <StickyBar c={c} chat={chat} />
      <Tracker slug={c.slug} base={base} />
      {c.forms.length > 0 && <LeadForms forms={c.forms} slug={c.slug} base={base} />}
      {c.popup && <Popup data={c.popup} chat={chat} storageKey={`popup:${c.slug}:${hash(c.popup)}`} closeLabel="إغلاق" />}
    </>
  );
}
