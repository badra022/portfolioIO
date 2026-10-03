/** Builds deep links that open a chat with the message already typed. */
export type Channel = "whatsapp" | "telegram" | "messenger";

export type ChatConfig = {
  primary: Channel;
  whatsapp: string;
  telegram?: string;
  messenger?: string;
  refCodes: boolean;
  refLabel: string;
};

export function fill(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

export function withRef(message: string, ref: string | undefined, cfg: Pick<ChatConfig, "refCodes" | "refLabel">): string {
  if (!ref || !cfg.refCodes) return message;
  return `${message}\n\n(${cfg.refLabel}: ${ref})`;
}

/**
 * WhatsApp and Telegram accept pre-filled text. Messenger links can't carry text
 * reliably, so they open the chat only (the UI copies the message first).
 */
export function chatUrl(cfg: ChatConfig, message: string, ref?: string, overrideWhatsapp?: string): string {
  const text = encodeURIComponent(withRef(message, ref, cfg));
  switch (cfg.primary) {
    case "telegram":
      if (cfg.telegram) return `https://t.me/${cfg.telegram}?text=${text}`;
      break;
    case "messenger":
      if (cfg.messenger) return `https://m.me/${cfg.messenger}`;
      break;
  }
  return `https://wa.me/${overrideWhatsapp ?? cfg.whatsapp}?text=${text}`;
}
