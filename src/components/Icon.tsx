const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const paths: Record<string, React.ReactNode> = {
  whatsapp: (<><path d="M3.6 20.4l1.3-4.1A8.5 8.5 0 1 1 8.1 19.2z" /><path d="M9.2 8.3c-.2 3.3 3 6.6 6.4 6.6l1-1.3-1.9-1.1-.9.8a5 5 0 0 1-2.6-2.6l.8-.9-1.1-1.9z" fill="currentColor" stroke="none" /></>),
  whatsappChannel: (<><path d="M3.6 20.4l1.3-4.1A8.5 8.5 0 1 1 8.1 19.2z" /><path d="M8.5 10.5l6-2.5v8l-6-2.5zM8.5 10.5v3" /></>),
  telegram: (<path d="M21 4L3 11l6 2 2 6 3-4 5 4z" />),
  messenger: (<><path d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.3 6.4V21l3-1.7c.9.3 1.8.4 2.7.4 5 0 9-3.7 9-8.4S17 3 12 3z" /><path d="M7.5 13.5l3-3 2.5 2 3.5-3" /></>),
  youtube: (<><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="M10.2 9.2v5.6l4.8-2.8z" fill="currentColor" /></>),
  tiktok: (<><path d="M13.5 3v11.6a3.6 3.6 0 1 1-3.6-3.6" /><path d="M13.5 3c.4 2.6 2.3 4.3 5 4.4" /></>),
  facebook: (<path d="M14 21v-8h3l.5-3.4H14V7.6c0-1 .4-1.7 1.8-1.7H18V3.1a21 21 0 0 0-2.7-.2C12.6 2.9 11 4.5 11 7.3v2.3H8V13h3v8" />),
  instagram: (<><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r=".9" fill="currentColor" stroke="none" /></>),
  x: (<path d="M4 4l16 16M20 4L4 20" />),
  pin: (<><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></>),
  book: (<><path d="M4 4.5h6a2 2 0 0 1 2 2V20a1.5 1.5 0 0 0-1.5-1.5H4z" /><path d="M20 4.5h-6a2 2 0 0 0-2 2V20a1.5 1.5 0 0 1 1.5-1.5H20z" /></>),
  chat: (<><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></>),
  check: (<><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>),
  loop: (<><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></>),
  trophy: (<><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5" /><path d="M12 14v3M8.5 20h7l-1-3h-5z" /></>),
  bolt: (<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" />),
  star: (<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />),
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" /></>),
  play: (<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />),
  calendar: (<><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>),
  megaphone: (<><path d="M3.5 10v4h3l7 4.5v-13L6.5 10z" /><path d="M17 9a4 4 0 0 1 0 6" /></>),
};

export type IconName = keyof typeof paths;

export function Icon({ name, className }: { name: IconName | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...S}>
      {paths[name] ?? paths.chat}
    </svg>
  );
}
