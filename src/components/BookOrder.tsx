"use client";
import { useState } from "react";
import type { Content } from "@/lib/schema";
import { chatUrl, fill, type ChatConfig } from "@/lib/chat";
import { Icon } from "./Icon";
import { ChatButton } from "./ChatButton";

export function BookOrder({ order, chat }: { order: NonNullable<Content["book"]>["order"]; chat: ChatConfig }) {
  const [grade, setGrade] = useState(order.grades[0]);
  const [delivery, setDelivery] = useState(order.delivery[0].id);
  const d = order.delivery.find((x) => x.id === delivery) ?? order.delivery[0];
  const href = chatUrl(chat, fill(order.message, { grade, delivery: d.value }), order.ref, order.whatsapp);

  return (
    <form className="order" onSubmit={(e) => e.preventDefault()}>
      <h3>{order.title}</h3>
      <div className="order-row">
        <div>
          <label className="lbl" htmlFor="book-grade">{order.gradeLabel}</label>
          <select id="book-grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
            {order.grades.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <span className="lbl">{order.deliveryLabel}</span>
          <div className="opts" role="radiogroup" aria-label={order.deliveryLabel}>
            {order.delivery.map((o) => (
              <label className="opt" key={o.id}>
                <input type="radio" name="book-delivery" id={`book-${o.id}`} value={o.id} checked={delivery === o.id} onChange={() => setDelivery(o.id)} />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      </div>
      {order.form ? (
        <ChatButton chat={chat} label={order.cta} message="" refCode={order.ref} form={order.form}
          context={{ [order.gradeLabel]: grade, [order.deliveryLabel]: d.label }} />
      ) : (
        <a className="btn btn-wa" href={href} target="_blank" rel="noopener noreferrer"><Icon name={chat.primary} />{order.cta}</a>
      )}
      {order.note && (
        <p className="note">
          {order.note.split("{phone}")[0]}
          {order.notePhone && <span className="num" dir="ltr">{order.notePhone}</span>}
          {order.note.split("{phone}")[1]}
        </p>
      )}
    </form>
  );
}
