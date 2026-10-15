"use client";
import { useUI } from "@/components/UIText";

export default function NotFound() {
  const t = useUI();
  return (
    <main className="platform-home">
      <h1>404</h1>
      <p>{t.notFound}</p>
    </main>
  );
}
