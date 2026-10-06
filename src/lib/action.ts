import { withRef, type ChatConfig } from "./chat";
import type { ActionT } from "./schema";

/** A button that can open WhatsApp (any number), Telegram, Messenger, a phone call or a web link. */
export type { ActionT };
export type ActionType = ActionT["type"];

const text = (a: ActionT, chat: ChatConfig) => (a.message ? encodeURIComponent(withRef(a.message, a.ref, chat)) : "");

export function actionHref(a: ActionT, chat: ChatConfig): string {
  const to = (a.to ?? "").trim();
  switch (a.type) {
    case "telegram": {
      const t = text(a, chat);
      return `https://t.me/${to.replace(/^@/, "")}${t ? `?text=${t}` : ""}`;
    }
    case "messenger":
      return `https://m.me/${to.replace(/^@/, "")}`;
    case "phone":
      return `tel:${to.replace(/[^\d+]/g, "")}`;
    case "link":
      // Validated as http(s) on save; checked again so a stored javascript: link can never render.
      return /^https?:\/\//i.test(to) ? to : "#";
    default: {
      const t = text(a, chat);
      return `https://wa.me/${to.replace(/\D/g, "") || chat.whatsapp}${t ? `?text=${t}` : ""}`;
    }
  }
}

export const actionIcon = (type: ActionType) => (type === "link" ? "link" : type);
