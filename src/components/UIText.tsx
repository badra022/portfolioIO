"use client";
import { createContext, useContext } from "react";
import { ui, type UIText } from "@/lib/i18n";

const Ctx = createContext<UIText>(ui("ar-EG"));

/** The site's built-in texts (lib/i18n.ts) for the components that run in the browser. */
export function UITextProvider({ locale, children }: { locale: string; children: React.ReactNode }) {
  return <Ctx.Provider value={ui(locale)}>{children}</Ctx.Provider>;
}

export const useUI = () => useContext(Ctx);
