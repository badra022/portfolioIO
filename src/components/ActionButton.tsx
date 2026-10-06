import { actionHref, actionIcon, type ActionT } from "@/lib/action";
import type { ChatConfig } from "@/lib/chat";
import { Icon } from "./Icon";

/** Button for a configurable action (WhatsApp, Telegram, Messenger, call or link). */
export function ActionButton({ action, chat, block, size, variant = "primary" }: {
  action: ActionT;
  chat: ChatConfig;
  block?: boolean;
  size?: "sm" | "md";
  variant?: "primary" | "ghost";
}) {
  const href = actionHref(action, chat);
  const external = !href.startsWith("tel:");
  const cls = ["btn", variant === "primary" ? "btn-wa" : "btn-ghost", size === "sm" && "btn-sm", block && "btn-block"].filter(Boolean).join(" ");
  return (
    <a className={cls} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} data-ref={action.ref}>
      <Icon name={actionIcon(action.type)} />
      {action.label}
    </a>
  );
}
