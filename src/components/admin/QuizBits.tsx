import type { SiteEnv } from "@/lib/environments";
import type { QuizT } from "@/lib/schema";
import type { Availability } from "@/lib/quiz";
import { setQuizStateAction } from "@/app/sites/[site]/admin/actions";

/** Status pill text for a quiz. */
export function quizStatus(q: QuizT, a: Availability): { label: string; tone: string } {
  if (a.open) return { label: q.state === "open" ? "مفتوح (يدوي)" : "مفتوح", tone: "new" };
  switch (a.reason) {
    case "notYet": return { label: "لسه مبدأش", tone: "contacted" };
    case "over": return { label: "انتهى", tone: "" };
    case "empty": return { label: "من غير أسئلة", tone: "" };
    default: return { label: "مقفول", tone: "" };
  }
}

/** Open now / close now / follow the dates. */
export function QuizStateButtons({ site, path, state, env }: { site: string; path: string; state: QuizT["state"]; env: SiteEnv }) {
  const opts: { v: QuizT["state"]; label: string }[] = [
    { v: "open", label: "افتح الآن" },
    { v: "closed", label: "اقفل الآن" },
    { v: "auto", label: "حسب التواريخ" },
  ];
  return (
    <span className="qz-state">
      {opts.filter((o) => o.v !== state).map((o) => (
        <form key={o.v} action={setQuizStateAction.bind(null, site, path, o.v, env)}>
          <button type="submit" className={`btn-sm ${o.v === "closed" ? "danger" : "ghost"}`}>{o.label}</button>
        </form>
      ))}
    </span>
  );
}
