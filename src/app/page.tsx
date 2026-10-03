import { getTenant } from "@/lib/tenant";
import type { ChatConfig } from "@/lib/chat";
import type { Content } from "@/lib/schema";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Grades } from "@/components/Grades";
import { Schedule } from "@/components/Schedule";
import { Method } from "@/components/Method";
import { Book } from "@/components/Book";
import { Students } from "@/components/Students";
import { Challenge } from "@/components/Challenge";
import { Announcement, Exams } from "@/components/Exams";
import { Youtube } from "@/components/Youtube";
import { Final } from "@/components/Final";
import { Footer, StickyBar } from "@/components/Footer";

function chatConfig(c: Content): ChatConfig {
  const { primary, whatsapp, telegram, messenger, refCodes, refLabel } = c.contact;
  return { primary, whatsapp, telegram, messenger, refCodes, refLabel };
}

export default function Page() {
  const { content: c } = getTenant();
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
    youtube: () => <Youtube data={c.youtube!} avatar={c.profile.avatar} />,
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
      <StickyBar c={c} chat={chat} />
    </>
  );
}
