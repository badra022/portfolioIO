import { chatUrl, type ChatConfig } from "@/lib/chat";
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
};

/** A link that opens the teacher's chat with a ready-to-send message. */
export function ChatButton({ chat, label, message, refCode, variant = "primary", size = "md", block, className, whatsappOverride }: Props) {
  const cls = ["btn", variant === "primary" ? "btn-wa" : "btn-ghost", size === "sm" && "btn-sm", block && "btn-block", className]
    .filter(Boolean).join(" ");
  return (
    <a className={cls} href={chatUrl(chat, message, refCode, whatsappOverride)} target="_blank" rel="noopener noreferrer" data-ref={refCode}>
      <Icon name={chat.primary} />
      {label}
    </a>
  );
}
