import type { Content } from "@/lib/schema";
import { Icon } from "./Icon";

export function Socials({ items, iconOnly }: { items: Content["socials"]; iconOnly?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="socials">
      {items.map((s) => (
        <a key={s.url} className="soc" href={s.url} target="_blank" rel="noopener noreferrer" aria-label={iconOnly ? s.label : undefined}>
          <Icon name={s.type} />
          {!iconOnly && s.label}
        </a>
      ))}
    </div>
  );
}
