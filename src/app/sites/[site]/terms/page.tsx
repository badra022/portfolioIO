import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OstazLogo } from "@/components/brand/OstazLogo";
import { DevCredit } from "@/components/DevCredit";
import { BRAND } from "@/lib/platform";
import "@/components/signup/signup.css";

export const metadata: Metadata = { title: "شروط التجربة المجانية · ostaz.com", robots: { index: false, follow: true } };

/** The free trial's terms, accepted in the sign-up form (components/signup/SignupFlow.tsx). Platform host only. */
export default async function Terms({ params }: PageProps<"/sites/[site]/terms">) {
  if (decodeURIComponent((await params).site) !== "_platform") notFound();
  return (
    <main className="su su-terms" lang="ar" dir="rtl">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" precedence="default" />
      <header className="su-head"><OstazLogo size={36} href="/" /></header>
      <article className="su-card">
        <h1>شروط التجربة المجانية</h1>
        <p>لما تعمل موقع تجريبي على {BRAND.name} بتوافق على الشروط دي:</p>
        <ol>
          <li><b>التصميم ملك المنصة.</b> شكل الموقع وتصميمه والمحتوى الجاهز والنصوص والصور التجريبية ولوحة التحكم والكود كلهم ملك {BRAND.name}. التجربة بتديك حق تشوفهم وتجربهم بس.</li>
          <li><b>ممنوع النسخ.</b> ممنوع تنسخ التصميم أو المحتوى الجاهز أو تاخد منه صور أو تسجيل شاشة أو تديه لأي شخص أو شركة أو برنامج ذكاء اصطناعي علشان يعمل موقع شبهه.</li>
          <li><b>محتواك ملكك.</b> اسمك وصورك وفيديوهاتك واللوجو بتاعك فضلوا ملكك، وبنستخدمهم في موقعك بس.</li>
          <li><b>مدة التجربة.</b> الموقع ولوحة التحكم شغالين 24 ساعة، وبعدها بيقفوا لوحدهم. كل اللي عملته بيفضل محفوظ لحد ما تفعّل الموقع.</li>
          <li><b>تجربة واحدة لكل رقم.</b> رقم الواتساب بيتأكد بكود، وكل رقم ليه موقع تجريبي واحد.</li>
          <li><b>بياناتك.</b> بنستخدم رقمك واسمك علشان نبني موقعك ونكلمك بخصوصه بس، ومش بنبيعهم أو نديهم لحد.</li>
          <li><b>من حقنا نوقف أي تجربة</b> بتخالف الشروط دي أو بتتعمل باسم حد تاني.</li>
        </ol>
        <p className="su-note">عجبك موقعك؟ كلمنا على واتساب ونفعّله ليك ونربطه بالعنوان بتاعك.</p>
      </article>
      <DevCredit siteName={BRAND.name} />
    </main>
  );
}
