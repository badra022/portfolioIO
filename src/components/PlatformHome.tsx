import { headers } from "next/headers";
import { env } from "@/lib/env";
import { SignupFlow } from "./signup/SignupFlow";
import "./signup/signup.css";

/**
 * What the platform's own domain shows at "/": the page paid ads point to. It
 * sells the idea in one screen, then the «جرّب موقعك» form builds the visitor's
 * own trial site (components/signup/SignupFlow.tsx). Teachers' sites live on
 * their own addresses; the platform console stays at /admin.
 */
export async function PlatformHome() {
  const host = (await headers()).get("host") ?? "";
  const before = env.rootDomain ? "" : `${host}/t/`;
  const after = env.rootDomain ? `.${env.rootDomain}` : "";
  return (
    <main className="su" lang="ar" dir="rtl">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" precedence="default" />
      <header className="su-head">
        <a className="su-brand" href="/"><span aria-hidden="true">أ</span>أستاذ</a>
        <a className="su-btn ghost sm" href="#start">جرّب ببلاش</a>
      </header>

      <section className="su-hero">
        <div className="su-hero-text">
          <span className="su-badge">تجربة مجانية 24 ساعة · من غير دفع</span>
          <h1>موقعك كمدرس <em>جاهز في دقيقتين</em></h1>
          <p>اكتب اسمك ومادتك ورقمك، وشوف موقعك الحقيقي بكل حاجة فيه: المواعيد، الحجز على واتساب، الامتحانات، لوحة الشرف، اختبارات وتصويتات بتنتشر، ولوحة تحكم تعدّل منها من موبايلك.</p>
          <ul className="su-points">
            <li><b>بيجيبلك طلاب</b> لينك واحد في البايو بيعرّف بيك ويحجز للطالب</li>
            <li><b>بيوفّر وقتك</b> المواعيد والأسئلة الشائعة بترد بدالك</li>
            <li><b>بيقيس تسويقك</b> تعرف مين جالك منين وأنهي بوست جاب حجز</li>
          </ul>
          <a className="su-btn primary lg" href="#start">ابني موقعي دلوقتي</a>
        </div>
      </section>

      <SignupFlow before={before} after={after} />

      <footer className="su-foot">
        <span>أستاذ · مواقع المدرسين والسناتر</span>
        <a href="/admin">دخول الإدارة</a>
      </footer>
    </main>
  );
}
