import { withRef, type ChatConfig } from "./chat";

/** A button that can open WhatsApp (any number), Telegram, Messenger, a phone call or a web link. */
export type ActionType = "whatsapp" | "telegram" | "messenger" | "phone" | "link";
export type ActionT = { label: string; type: ActionType; to?: string; message?: string; ref?: string };

const text = (a: ActionT, chat: ChatConfig) => (a.message ? encodeURIComponent(withRef(a.message, a.ref, chat)) : "");

export function actionHref(a: ActionT, chat: ChatConfig): string {
  const to = (a.to ?? "").trim();
  switch (a.type) {
    case "telegram": {
      const t = text(a, chat);
      return `https://t.me/${to.replace(/^@/, "")}${t ? `?text=${t}` : ""}`;
    }
    case "messenger":
      return `https://m.me/${to}`;
    case "phone":
      return `tel:${to.replace(/[^\d+]/g, "")}`;
    case "link":
      return to;
    default: {
      const t = text(a, chat);
      return `https://wa.me/${to || chat.whatsapp}${t ? `?text=${t}` : ""}`;
    }
  }
}

export const actionIcon = (type: ActionType) => (type === "link" ? "link" : type);
