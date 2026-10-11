"use client";
import { useEffect, useRef } from "react";

/**
 * Keeps a dialog layer (pop-layer) inside the part of the screen the on-screen
 * keyboard leaves visible. Phones don't shrink fixed elements when the keyboard
 * opens (iOS never, Android depends), so a bottom sheet stays behind it: here
 * the layer follows the visual viewport, and the field being typed in is
 * scrolled into view inside the sheet.
 */
export function useAboveKeyboard<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const layer = ref.current;
    const vv = window.visualViewport;
    if (!active || !layer || !vv) return;
    const fit = () => {
      layer.style.top = `${vv.offsetTop}px`;
      layer.style.height = `${vv.height}px`;
      layer.style.bottom = "auto";
      layer.style.setProperty("--vvh", `${vv.height}px`);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.matches?.("input, select, textarea")) return;
      // After the keyboard has opened and the layer has moved up.
      clearTimeout(timer);
      timer = setTimeout(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }), 320);
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    layer.addEventListener("focusin", onFocus);
    return () => {
      clearTimeout(timer);
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      layer.removeEventListener("focusin", onFocus);
    };
  }, [active]);
  return ref;
}

/** True on devices with a mouse/trackpad, where focusing the first field is a help, not a keyboard popping up. */
export const hasFinePointer = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
