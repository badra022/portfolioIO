"use client";
import { useHome, useUI } from "@/components/UIText";

/** Any page that doesn't exist on a teacher's site: says so and leads back to the teacher's main page. */
export default function NotFound() {
  const t = useUI();
  const home = useHome();
  return (
    <main className="platform-home">
      <h1>404</h1>
      <p>{t.notFound}</p>
      {home && <p><a className="btn btn-wa" href={home}>{t.backToMain}</a></p>}
    </main>
  );
}
