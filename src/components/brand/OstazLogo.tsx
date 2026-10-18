import { BRAND } from "@/lib/platform";

/** The platform's logo: the mark (a graduate's «o» on baby blue) and «myostaz.com». Files: public/brand/. */
export function OstazMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id="ostaz-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4FA8FF" /><stop offset="1" stopColor="#1D6FE0" /></linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#ostaz-g)" />
      <circle cx="24" cy="29.5" r="8.6" fill="none" stroke="#fff" strokeWidth="5" />
      <path d="M24 8.5 39 14.8 24 21.1 9 14.8Z" fill="#fff" />
      <path d="M35.6 16.3v6.2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="35.6" cy="23.6" r="1.9" fill="#BFE0FF" />
    </svg>
  );
}

export function OstazLogo({ size = 32, href, className }: { size?: number; href?: string; className?: string }) {
  const name = BRAND.name.split(".");
  const body = (
    <>
      <OstazMark size={size} />
      <span className="ostaz-word" dir="ltr" style={{ fontSize: size * 0.62 }}>
        {name[0]}{name.length > 1 && <i>.{name.slice(1).join(".")}</i>}
      </span>
    </>
  );
  return href
    ? <a className={`ostaz-logo${className ? ` ${className}` : ""}`} href={href} aria-label={BRAND.name}>{body}</a>
    : <span className={`ostaz-logo${className ? ` ${className}` : ""}`} aria-label={BRAND.name}>{body}</span>;
}
