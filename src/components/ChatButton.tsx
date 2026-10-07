import { chatUrl, type ChatConfig } from "@/lib/chat";
import { leadAttr, sourceLabel } from "@/lib/lead";
import { Icon } from "./Icon";

type Props = {
  chat: ChatConfig;
  label: string;
  message: string;
  refCode?: string;
  variant?: "primary" | "ghost";
  size?: "md" | "sm";
  block?: boolean;
  className?: string;
  whatsappOverride?: string;
  /** Opens this form (content.forms) instead of the chat. */
  form?: string;
  /** Details sent with the form (label -> value), e.g. the chosen answer or group. */
  context?: Record<string, string>;
  /** While set, tapping shows this instead of the form (something must be picked first). */
  needs?: string;
};

/** A link that opens the teacher's chat with a ready-to-send message, or a button that opens a form. */
export function ChatButton({ chat, label, message, refCode, variant = "primary", size = "md", block, className, whatsappOverride, form, context, needs }: Props) {
  const cls = ["btn", variant === "primary" ? "btn-wa" : "btn-ghost", size === "sm" && "btn-sm", block && "btn-block", className]
    .filter(Boolean).join(" ");
  if (form) {
    return (
      <button type="button" className={cls} {...leadAttr({ f: form, s: sourceLabel(label, refCode), c: context, n: needs })}>
        <Icon name="form" />
        {label}
      </button>
    );
  }
  return (
    <a className={cls} href={chatUrl(chat, message, refCode, whatsappOverride)} target="_blank" rel="noopener noreferrer" data-ref={refCode}>
      <Icon name={chat.primary} />
      {label}
    </a>
  );
}
