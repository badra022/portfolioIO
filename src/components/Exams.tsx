import type { Content } from "@/lib/schema";
import type { ChatConfig } from "@/lib/chat";
import { dateParts, parseDate } from "@/lib/format";
import { ExamCard } from "./ExamCard";
import { SectionHead } from "./SectionHead";
import { ExamResults, type PastExamItem } from "./ExamResults";

type Data = NonNullable<Content["exams"]>;

/** Past exams are already removed on the server (lib/content-utils.ts); this only orders them. */
export function upcomingExams(data: Data) {
  return [...data.items]
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || parseDate(a.date).getTime() - parseDate(b.date).getTime());
}

/** Where the results button finds the student's remembered name and phone (the ids used by the teacher's forms). */
export type ResultsSetup = { exams: PastExamItem[]; slug: string; base: string; nameId: string; phoneId: string };

export function Exams({ data, locale, chat, results }: { data: Data; locale: string; chat: ChatConfig; results: ResultsSetup }) {
  const items = upcomingExams(data);
  if (!items.length && !results.exams.length) return null;
  return (
    <section className="block" id="exams">
      <div className="wrap">
        <SectionHead eyebrow={data.eyebrow} title={data.title} intro={data.intro} />
        {items.length > 0 && (
          <div className={`exams count-${items.length}`}>
            {items.map((e) => <ExamCard key={e.id} exam={e} parts={dateParts(e.date, locale)} labels={data.labels} chat={chat} />)}
          </div>
        )}
        {results.exams.length > 0 && (
          <ExamResults {...results} locale={locale} label={data.resultsLabel} intro={data.resultsIntro} />
        )}
      </div>
    </section>
  );
}
