"use client";
import { useState } from "react";
import type { Content } from "@/lib/schema";
import { chatUrl, fill, type ChatConfig } from "@/lib/chat";
import { Icon } from "./Icon";
import { ChatButton } from "./ChatButton";
import { Rich } from "./Rich";

type Data = NonNullable<Content["challenge"]>;

function Question({ q, n, data, chat }: { q: Data["questions"][number]; n: number; data: Data; chat: ChatConfig }) {
  const [answer, setAnswer] = useState<string | null>(null);
  const href = chatUrl(chat, fill(data.message, { n, answer: answer ?? "...", prize: data.prize ?? "" }), `CHALLENGE-${n}`);
  return (
    <div className="q">
      <span className="q-lvl">{q.level}</span>
      <h3>{q.question}</h3>
      <div className="answers">
        {q.options.map((o, i) => (
          <label className="ans" key={o}>
            <input type="radio" name={`q${n}`} id={`q${n}-${i}`} value={o} checked={answer === o} onChange={() => setAnswer(o)} />
            <span className="num">{o}</span>
          </label>
        ))}
      </div>
      {data.form ? (
        <ChatButton
          chat={chat}
          variant={answer ? "primary" : "ghost"}
          label={data.sendLabel}
          message=""
          refCode={`CHALLENGE-${n}`}
          form={data.form}
          context={{ "السؤال": `${n}. ${q.question}`, "الإجابة": answer ?? "" }}
          needs={answer ? undefined : "اختار إجابة الأول"}
        />
      ) : (
        <a className={`btn ${answer ? "btn-wa" : "btn-ghost"}`} href={href} target="_blank" rel="noopener noreferrer">
          <Icon name={chat.primary} />{data.sendLabel}
        </a>
      )}
    </div>
  );
}

export function Challenge({ data, chat }: { data: Data; chat: ChatConfig }) {
  return (
    <section className="block" id="challenge">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">{data.eyebrow}</span>
          <h2><Rich value={data.title} /></h2>
          {data.intro && <p>{data.intro}</p>}
          {data.prize && <p className="prize-line"><Icon name="trophy" />{data.prize}</p>}
        </div>
        <div className="challenges">
          {data.questions.map((q, i) => <Question key={i} q={q} n={i + 1} data={data} chat={chat} />)}
        </div>
      </div>
    </section>
  );
}
