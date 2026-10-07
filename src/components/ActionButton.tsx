import { actionHref, actionIcon, type ActionT } from "@/lib/action";
import type { ChatConfig } from "@/lib/chat";
import { Icon } from "./Icon";
import { leadAttr, sourceLabel } from "@/lib/lead";

/** Button for a configurable action (WhatsApp, Telegram, Messenger, call or link). */
export function ActionButton({ action, chat, block, size, variant = "primary" }: {
  action: ActionT;
  chat: ChatConfig;
  block?: boolean;
  size?: "sm" | "md";
  variant?: "primary" | "ghost";
}) {
  const cls = ["btn", variant === "primary" ? "btn-wa" : "btn-ghost", size === "sm" && "btn-sm", block && "btn-block"].filter(Boolean).join(" ");
  if (action.form) {
    return (
      <button type="button" className={cls} {...leadAttr({ f: action.form, s: sourceLabel(action.label, action.ref) })}>
        <Icon name="form" />
        {action.label}
      </button>
    );
  }
  const href = actionHref(action, chat);
  const external = !href.startsWith("tel:");
  return (
    <a className={cls} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} data-ref={action.ref}>
      <Icon name={actionIcon(action.type)} />
      {action.label}
    </a>
  );
}
