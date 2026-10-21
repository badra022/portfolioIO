import { DEVELOPER } from "@/lib/platform";
import { Icon } from "@/components/Icon";
import { OstazLogo, OstazMark } from "@/components/brand/OstazLogo";
import { LoopVideo } from "./LoopVideo";
import { ContactForm } from "./ContactForm";
import "@/components/signup/signup.css";
import "./landing.css";

/**
 * myostaz.com's public home page: what the service is, shown through a demo teacher's real
 * site and admin panel (clips and screens in public/brand/landing, made from the demo
 * template, never a real teacher). Visitors reach us on WhatsApp or through the «كلمنا»
 * form (admin/leads); partners sign in from the header. Building sites is for partners only
 * (their own page, components/PartnerHome.tsx), so it isn't offered here.
 */
const M = "/brand/landing";
const wa = (text: string) => `https://wa.me/${DEVELOPER.whatsapp}?text=${encodeURIComponent(text)}`;
const WA_TEACHER = wa("أهلاً، أنا مدرس وعايز أعرف تفاصيل موقع myostaz.");
const WA_CENTER = wa("أهلاً، عندنا سنتر/مدرسين وعايزين نعرف تفاصيل myostaz.");
const WA_PARTNER = wa("أهلاً، عايز أبقى شريك مع myostaz (وكالة تسويق).");

const TOUR: { img: string; title: string }[] = [
  { img: "s-top", title: "الصفحة الرئيسية" },
  { img: "s-schedule", title: "المواعيد والحجز" },
  { img: "s-exams", title: "الامتحانات" },
  { img: "s-honors", title: "لوحة الشرف" },
  { img: "s-book", title: "الكتب والمذكرات" },
  { img: "s-reviews", title: "آراء الطلاب" },
  { img: "s-grades", title: "نتايج الامتحانات" },
  { img: "s-challenge", title: "سؤال التحدي" },
  { img: "pg-sample-quiz", title: "اختبار أونلاين" },
  { img: "pg-sample-vote", title: "تصويت" },
];
const ADMIN: { img: string; title: string }[] = [
  { img: "a-home", title: "الرئيسية" },
  { img: "a-requests", title: "طلبات الحجز" },
  { img: "a-analytics", title: "الإحصائيات" },
  { img: "a-students", title: "الطلاب" },
  { img: "a-quizzes", title: "الاختبارات" },
  { img: "a-results", title: "رصد الدرجات" },
  { img: "a-edit-hero", title: "تعديل المحتوى" },
  { img: "a-referrals", title: "مصادر الحجز" },
];
const CHIPS = ["المواعيد", "الحجز على واتساب", "الامتحانات", "النتايج بالاسم والموبايل", "لوحة الشرف", "اختبارات أونلاين", "تصويتات", "الكتب والمذكرات", "آراء الطلاب", "الأسئلة الشائعة", "الشكاوى والاقتراحات", "الإحصائيات", "فيديوهات يوتيوب", "إعلانات وعروض"];

const FEATURES: { icon: string; title: string; text: string }[] = [
  { icon: "whatsapp", title: "حجز على واتساب برسالة جاهزة", text: "الطالب يختار المجموعة ويضغط، والرسالة بتوصلك مكتوبة: الاسم والسنة والميعاد. أو يسيب بياناته في فورم توصلك في اللوحة." },
  { icon: "calendar", title: "مواعيد واضحة بالفلاتر", text: "كل المجموعات بالمرحلة واليوم والمنطقة، مع الأماكن المتاحة. مفيش «هو الميعاد إمتى؟» تاني." },
  { icon: "trophy", title: "امتحانات ونتايج", text: "اعلن عن امتحان الشهر والجوايز، وارفع الدرجات من شيت. كل طالب يعرف نتيجته بالاسم والموبايل، ومحدش يشوف غير درجته." },
  { icon: "bolt", title: "اختبارات وتصويتات بتنتشر", text: "اختبار بوقت وأسئلة بالصور، بيتصحح لوحده. الطلاب بيشيروه لبعض، فاسمك بيوصل لطلاب جداد." },
  { icon: "crown", title: "لوحة شرف وآراء الطلاب", text: "أوائلك ونتايجهم وكلام طلابك في مكان واحد. ده أقوى سبب يخلّي ولي الأمر يختارك." },
  { icon: "megaphone", title: "تعرف تسويقك جاب إيه", text: "زوار، ضغطات، وحجوزات من كل مصدر: أنهي بوست وأنهي جروب وأنهي لينك جاب طلاب فعلاً." },
];

const FAQ: { q: string; a: string }[] = [
  { q: "محتاج أعرف برمجة أو تصميم؟", a: "خالص. إحنا بنجهّز الموقع بمحتواك وصورك، وإنت بتعدّل أي حاجة بعد كده من لوحة التحكم على موبايلك، زي ما بتكتب بوست." },
  { q: "الموقع هيبقى باسمي؟", a: "أيوه. عنوانه بيبقى باسمك على myostaz.com، ولو عندك دومين خاص (اسمك.com) نربطهولك." },
  { q: "الطالب بيحجز إزاي؟", a: "بيضغط زرار الحجز، فيفتح واتساب برسالة جاهزة فيها كل التفاصيل، أو يملا فورم قصير والطلب يوصلك في لوحة التحكم مع رقمه." },
  { q: "أقدر أعدّل المواعيد والمحتوى بنفسي؟", a: "طبعاً. المواعيد والامتحانات والعروض والصور والنصوص، كل حاجة. وكل تعديل بيتحفظ له نسخة، فتقدر ترجع لأي نسخة قديمة بضغطة." },
  { q: "بيانات الطلاب في أمان؟", a: "البيانات محفوظة على سيرفرات مؤمّنة، ولوحة التحكم بكلمة سر محدش يعرفها غيرك. ونتيجة كل طالب بتظهر له هو بس." },
  { q: "بتشتغلوا مع السناتر ووكالات التسويق؟", a: "أيوه. السناتر بتجهّز مواقع لكل مدرسيها، والوكالات بتشتغل معانا كشركاء بحساب خاص بيهم يديروا منه مواقع عملائهم." },
  { q: "التكلفة كام؟", a: "حسب احتياجك وعدد المدرسين. كلمنا على واتساب أو ابعت الفورم ونرشّحلك الباقة المناسبة." },
];

function Phone({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`lp-phone ${className}`}><span className="lp-notch" aria-hidden="true" /><div className="lp-screen">{children}</div></div>;
}

function Shots({ items, reverse, label }: { items: { img: string; title: string }[]; reverse?: boolean; label: string }) {
  const card = (s: { img: string; title: string }, i: number, dup: boolean) => (
    <figure key={`${dup ? "d" : ""}${i}`} className="lp-shot" aria-hidden={dup || undefined}>
      <img src={`${M}/${s.img}.webp`} alt={dup ? "" : s.title} loading="lazy" decoding="async" width={480} height={1039} />
      <figcaption>{s.title}</figcaption>
    </figure>
  );
  return (
    <div className={`lp-marquee${reverse ? " rev" : ""}`} role="region" aria-label={label}>
      <div className="lp-track">{items.map((s, i) => card(s, i, false))}{items.map((s, i) => card(s, i, true))}</div>
    </div>
  );
}

export function MarketingHome({ isSuper = false, year }: { isSuper?: boolean; year: number }) {
  return (
    <main className="su lp" lang="ar" dir="rtl">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" precedence="default" />

      <header className="lp-head">
        <div className="lp-head-in">
          <OstazLogo size={34} href="/" />
          <nav className="lp-nav" aria-label="أقسام الصفحة">
            <a href="#features">المميزات</a>
            <a href="#tour">جولة في الموقع</a>
            <a href="#admin">لوحة التحكم</a>
            <a href="#partners">للسناتر والشركاء</a>
            <a href="#faq">الأسئلة</a>
          </nav>
          <div className="lp-head-cta">
            {isSuper
              ? <a className="su-btn ghost sm" href="/admin">لوحة الإدارة</a>
              : <a className="su-btn ghost sm" href="/login"><Icon name="users" />دخول الشركاء</a>}
            <a className="su-btn primary sm" href={WA_TEACHER} target="_blank" rel="noopener"><Icon name="whatsapp" />كلمنا</a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-hero-text">
          <span className="su-badge">منصة مواقع المدرسين والسناتر</span>
          <h1>موقع احترافي باسمك، <em>يجيبلك طلاب</em> ويرتّب شغلك</h1>
          <p>صفحة واحدة فيها كل اللي طالبك وولي أمره محتاجينه: المواعيد والحجز على واتساب، الامتحانات والنتايج، لوحة الشرف والاختبارات الأونلاين. وإنت بتدير كل ده من موبايلك.</p>
          <div className="lp-cta-row">
            <a className="su-btn primary lg" href="#contact">اطلب موقعك</a>
            <a className="su-btn lg lp-wa" href={WA_TEACHER} target="_blank" rel="noopener"><Icon name="whatsapp" />كلمنا على واتساب</a>
          </div>
          <ul className="lp-trust">
            <li><Icon name="check" />من غير برمجة</li>
            <li><Icon name="check" />عنوان باسمك أو دومين خاص</li>
            <li><Icon name="check" />دعم حقيقي على واتساب</li>
          </ul>
        </div>
        <div className="lp-hero-media" aria-label="فيديو لموقع مدرس تجريبي">
          <div className="lp-laptop">
            <div className="lp-laptop-screen"><LoopVideo src={`${M}/desk.mp4`} poster={`${M}/desk-poster.webp`} label="موقع مدرس على الكمبيوتر" /></div>
            <div className="lp-laptop-base" aria-hidden="true" />
          </div>
          <Phone className="lp-hero-phone">
            <video src={`${M}/site.mp4`} poster={`${M}/site-poster.webp`} autoPlay muted loop playsInline aria-label="موقع مدرس على الموبايل" />
          </Phone>
          <div className="lp-float f1" aria-hidden="true"><span className="ic ok"><Icon name="whatsapp" /></span><div><b>طلب حجز جديد</b><small>تالتة ثانوي · السبت 4:00</small></div></div>
          <div className="lp-float f2" aria-hidden="true"><span className="ic"><Icon name="users" /></span><div><b>+118 تواصلوا معاك</b><small>الشهر ده</small></div></div>
          <div className="lp-float f3" aria-hidden="true"><span className="ic gold"><Icon name="trophy" /></span><div><b>امتحان الشهر</b><small>50 طالب حجزوا</small></div></div>
        </div>
      </section>

      <div className="lp-chips" aria-label="اللي في الموقع">
        <div className="lp-chips-track">{[...CHIPS, ...CHIPS].map((c, i) => <span key={i} aria-hidden={i >= CHIPS.length || undefined}>{c}</span>)}</div>
      </div>

      {/* Features */}
      <section className="lp-sec" id="features">
        <header className="lp-sec-head">
          <span className="lp-kicker">ليه myostaz</span>
          <h2>كل اللي المدرس محتاجه أونلاين، <em>في مكان واحد</em></h2>
          <p>مش مجرد صفحة تعريف. موقعك بيرد على الأسئلة بدالك، وبيحجز الطلاب، وبيقولك تسويقك جاب إيه.</p>
        </header>
        <div className="lp-features">
          {FEATURES.map((f) => (
            <article key={f.title} className="lp-feature">
              <span className="lp-ic"><Icon name={f.icon} /></span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Tour */}
      <section className="lp-sec lp-tour" id="tour">
        <header className="lp-sec-head">
          <span className="lp-kicker">جولة في الموقع</span>
          <h2>شوف شكل موقع <em>حقيقي</em> من جوه</h2>
          <p>دي صور من موقع مدرس تجريبي على المنصة. كل قسم بيتفعّل أو يتشال حسب شغلك.</p>
        </header>
        <Shots items={TOUR} label="صور من موقع مدرس" />
        <Shots items={[...TOUR].reverse()} reverse label="صور من موقع مدرس (صف تاني)" />
      </section>

      {/* Admin */}
      <section className="lp-sec lp-split" id="admin">
        <div className="lp-split-media">
          <Phone><LoopVideo src={`${M}/admin.mp4`} poster={`${M}/admin-poster.webp`} label="لوحة التحكم على الموبايل" /></Phone>
        </div>
        <div className="lp-split-text">
          <span className="lp-kicker">لوحة التحكم</span>
          <h2>شغلك كله <em>من موبايلك</em></h2>
          <p>كل صباح تعرف: مين طلب يحجز، مين اشتكى، وامتحانك الجاي فاضله كام يوم. وتعدّل الموقع في ثواني.</p>
          <ul className="lp-list">
            <li><Icon name="chat" /><div><b>طلبات الحجز في مكان واحد</b><span>باسم الطالب ورقمه والمجموعة، وتردّ عليه بضغطة على واتساب.</span></div></li>
            <li><Icon name="form" /><div><b>رصد الدرجات من شيت</b><span>الصق الدرجات، والطلاب يلاقوا نتايجهم على الموقع.</span></div></li>
            <li><Icon name="loop" /><div><b>كل تعديل محفوظ</b><span>نسخة لكل تغيير، وترجع لأي نسخة قديمة وقت ما تحب.</span></div></li>
            <li><Icon name="megaphone" /><div><b>إحصائيات بالعربي</b><span>زوار وحجوزات من كل مصدر، من غير ما تفهم في التسويق.</span></div></li>
          </ul>
        </div>
      </section>
      <Shots items={ADMIN} label="صور من لوحة التحكم" />

      {/* Quizzes */}
      <section className="lp-sec lp-split rev">
        <div className="lp-split-media">
          <Phone><LoopVideo src={`${M}/quiz.mp4`} poster={`${M}/quiz-poster.webp`} label="اختبار أونلاين على الموبايل" /></Phone>
        </div>
        <div className="lp-split-text">
          <span className="lp-kicker">اختبارات وتصويتات</span>
          <h2>اختبار أونلاين <em>بيتصحح لوحده</em></h2>
          <p>أسئلة اختيار أو مقالي، بالصور أو من غيرها، بوقت محدد وميعاد بداية ونهاية. الطالب يعرف درجته فوراً، وإنت تشوف الترتيب والإجابات.</p>
          <ul className="lp-list">
            <li><Icon name="star" /><div><b>بيجيبلك طلاب جداد</b><span>الطلاب بيشيروا الاختبار لصحابهم، وكل واحد بيدخل بيتعرف عليك.</span></div></li>
            <li><Icon name="help" /><div><b>تصويتات وأسئلة تحدي</b><span>اعرف رأي طلابك، أو اعمل سؤال الأسبوع وجايزة لأول إجابة صح.</span></div></li>
          </ul>
        </div>
      </section>

      {/* How we work */}
      <section className="lp-sec" id="how">
        <header className="lp-sec-head">
          <span className="lp-kicker">إزاي بنشتغل</span>
          <h2>من أول مكالمة <em>لحد ما موقعك يشتغل</em></h2>
        </header>
        <ol className="lp-steps">
          <li><span>1</span><h3>بنتكلم</h3><p>مكالمة قصيرة نفهم فيها مادتك وطلابك ومواعيدك، ونرشّحلك اللي يناسبك.</p></li>
          <li><span>2</span><h3>بنجهّز موقعك</h3><p>بمحتواك وصورك وألوانك، ونراجعه معاك لحد ما يبقى زي ما إنت عايز.</p></li>
          <li><span>3</span><h3>بتستلم وتبدأ</h3><p>لوحة تحكم باسمك وكلمة سر خاصة بيك، ودعم على واتساب في أي وقت.</p></li>
        </ol>
      </section>

      {/* Partners */}
      <section className="lp-sec" id="partners">
        <div className="lp-partner">
          <div>
            <span className="lp-kicker light">للسناتر ووكالات التسويق</span>
            <h2>بتدير مدرسين كتير؟ <em>اشتغل معانا كشريك</em></h2>
            <p>حساب شريك خاص بيك: تجهّز مواقع لكل عملائك، بفورم بالأسئلة اللي تحتاجها، وتتابع كل المواقع والأرقام من لوحة واحدة. وكمان تقدر تديرها بالكلام من Claude.</p>
            <ul className="lp-partner-points">
              <li><Icon name="check" />مواقع بلا حدود لعملائك</li>
              <li><Icon name="check" />لوحة واحدة لكل المواقع</li>
              <li><Icon name="check" />دعم مباشر من فريقنا</li>
            </ul>
            <div className="lp-cta-row">
              <a className="su-btn lg lp-light" href={WA_PARTNER} target="_blank" rel="noopener"><Icon name="whatsapp" />اطلب حساب شريك</a>
              {!isSuper && <a className="su-btn lg lp-outline" href="/login">عندك حساب؟ ادخل</a>}
            </div>
          </div>
          <div className="lp-partner-art" aria-hidden="true">
            <img src={`${M}/d-adm.webp`} alt="" loading="lazy" width={1440} height={900} />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-sec lp-faq" id="faq">
        <header className="lp-sec-head">
          <span className="lp-kicker">أسئلة بتتسأل كتير</span>
          <h2>عندك سؤال؟</h2>
        </header>
        <div className="lp-faq-list">
          {FAQ.map((f, i) => (
            <details key={i} name="lp-faq">
              <summary>{f.q}<i aria-hidden="true" /></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="lp-sec lp-contact" id="contact">
        <div className="lp-contact-text">
          <span className="lp-kicker">ابدأ دلوقتي</span>
          <h2>خلّينا نجهّزلك <em>موقعك</em></h2>
          <p>سيب رقمك وهنكلمك على واتساب، أو كلمنا إنت مباشرة.</p>
          <div className="lp-contact-cards">
            <a href={WA_TEACHER} target="_blank" rel="noopener"><span className="ic ok"><Icon name="whatsapp" /></span><div><b>واتساب</b><small dir="ltr">{DEVELOPER.phoneDisplay}</small></div></a>
            <a href={WA_CENTER} target="_blank" rel="noopener"><span className="ic"><Icon name="users" /></span><div><b>للسناتر</b><small>مواقع لكل مدرسيك</small></div></a>
            <a href={DEVELOPER.facebook} target="_blank" rel="noopener"><span className="ic fb"><Icon name="facebook" /></span><div><b>فيسبوك</b><small>تابع جديدنا</small></div></a>
          </div>
        </div>
        <div className="su-card"><ContactForm whatsapp={DEVELOPER.whatsapp} /></div>
      </section>

      <footer className="lp-foot">
        <div className="lp-foot-in">
          <div className="lp-foot-brand">
            <OstazLogo size={30} href="/" />
            <p>منصة مواقع للمدرسين والسناتر في مصر والعالم العربي: موقع باسمك، حجز على واتساب، امتحانات ونتايج، ولوحة تحكم من موبايلك.</p>
            <div className="lp-social">
              <a href={WA_TEACHER} target="_blank" rel="noopener" aria-label="واتساب"><Icon name="whatsapp" /></a>
              <a href={DEVELOPER.facebook} target="_blank" rel="noopener" aria-label="فيسبوك"><Icon name="facebook" /></a>
              <a href={`tel:+${DEVELOPER.whatsapp}`} aria-label="اتصل بينا"><Icon name="phone" /></a>
            </div>
          </div>
          <nav aria-label="المنتج"><h4>المنتج</h4>
            <a href="#features">المميزات</a><a href="#tour">جولة في الموقع</a><a href="#admin">لوحة التحكم</a><a href="#how">إزاي بنشتغل</a>
          </nav>
          <nav aria-label="الحلول"><h4>الحلول</h4>
            <a href={WA_TEACHER} target="_blank" rel="noopener">للمدرسين</a><a href={WA_CENTER} target="_blank" rel="noopener">للسناتر</a><a href="#partners">لوكالات التسويق</a><a href="/login">دخول الشركاء</a>
          </nav>
          <nav aria-label="الدعم"><h4>الدعم</h4>
            <a href="#faq">الأسئلة الشائعة</a><a href="#contact">تواصل معانا</a><a href={WA_TEACHER} target="_blank" rel="noopener">الدعم على واتساب</a><a href="/terms">الشروط والأحكام</a>
          </nav>
        </div>
        <div className="lp-foot-bar">
          <span><OstazMark size={18} /> © {year} myostaz.com · جميع الحقوق محفوظة</span>
          <span className="lp-foot-meta"><a href="/terms">الشروط</a><a href="#contact">تواصل معانا</a><span>صُنع في مصر</span></span>
        </div>
      </footer>

      <a className="lp-fab" href={WA_TEACHER} target="_blank" rel="noopener" aria-label="كلمنا على واتساب"><Icon name="whatsapp" /></a>
    </main>
  );
}
