"use client";
import { createContext, useContext } from "react";
import { ui, type UIText } from "@/lib/i18n";

const Ctx = createContext<UIText>(ui("ar-EG"));
/** Where the teacher's main page is, for links back to it from pages that have no other way home (404). */
const Base = createContext<string | null>(null);

/** The site's built-in texts (lib/i18n.ts) for the components that run in the browser. */
export function UITextProvider({ locale, base, children }: { locale: string; base?: string; children: React.ReactNode }) {
  return <Base.Provider value={base ?? null}><Ctx.Provider value={ui(locale)}>{children}</Ctx.Provider></Base.Provider>;
}

export const useUI = () => useContext(Ctx);
/** The teacher's main page address ("/", "/t/<slug>/", or the preview's), or null outside a teacher's site. */
export const useHome = () => { const b = useContext(Base); return b === null ? null : `${b}/`; };
