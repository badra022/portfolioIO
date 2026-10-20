"use client";

import { useState } from "react";

/** A value to copy (a link, a command) with a «انسخ» button next to it. */
export function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="copy-text">
      <code dir="ltr">{text}</code>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1800); }); }}>
        {done ? "اتنسخ ✓" : "انسخ"}
      </button>
    </span>
  );
}
