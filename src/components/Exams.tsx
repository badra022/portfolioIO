import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { dateParts, parseDate } from "@/lib/format";
import { ExamCard } from "./ExamCard";
import { Icon } from "./Icon";
import { SectionHead } from "./SectionHead";

type Data = NonNullable<Content["exams"]>;

/** Exams whose day has passed are dropped at build time. A scheduled rebuild keeps this fresh. */
export function upcomingExams(data: Data, now = new Date()) {
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  return data.items
    .filter((e) => parseDate(e.date) >= startOfToday)
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || parseDate(a.date).getTime() - parseDate(b.date).getTime());
}

export function Exams({ data, locale, chat }: { data: Data; locale: string; chat: ChatConfig }) {
  const items = upcomingExams(data);
  if (!items.length) return null;
  return (
    <section className="block" id="exams">
      <div className="wrap">
        <SectionHead eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
        <div className={`exams count-${items.length}`}>
          {items.map((e) => <ExamCard key={e.id} exam={e} parts={dateParts(e.date, locale)} labels={data.labels} chat={chat} />)}
        </div>
      </div>
    </section>
  );
}

export function Announcement({ data, locale }: { data: Data; locale: string }) {
  const featured = upcomingExams(data).find((e) => e.featured);
  if (!featured || !data.announcement) return null;
  const text = data.announcement.replace("{date}", dateParts(featured.date, locale).short);
  return (
    <a className="announce" href="#exams">
      <Icon name="megaphone" />
      <span>{text}</span>
      <span className="announce-arrow" aria-hidden="true">←</span>
    </a>
  );
}
