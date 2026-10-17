"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * The public «جرّب موقعك» form on the platform's home page (the page paid ads
 * point to): four short steps, then the site is built (api/signup) and every link
 * to try is listed. The site and its admin login work for 24 hours.
 */
type Err = { field: string; message: string };
type Done = { base: string; endsAt: string; username: string; links: { label: string; href: string }[] };

const TITLES_AR = ["أ.", "م.", "د.", "مستر", "ميس"];
const TITLES_EN = ["Mr.", "Ms.", "Dr."];
const COLORS = ["#1D6FE0", "#0EA5E9", "#16A34A", "#E3171F", "#F59E0B", "#7C3AED", "#DB2777", "#0F766E"];
const STEPS = ["عنك", "شكل موقعك", "التواصل والفيديوهات", "حساب لوحة التحكم"];

/** The site address around the slug: «mohamedali» + after, e.g. ".ostaz.io", or before "ostaz.io/t/". */
export function SignupFlow({ before, after }: { before: string; after: string }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    title: "أ.", name: "", subject: "", locale: "ar-EG" as "ar-EG" | "en",
    slogan: "", color: COLORS[0], scheme: "light" as "light" | "dark",
    phone: "", videos: ["", "", ""], slug: "", username: "", password: "", website: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [errors, setErrors] = useState<Err[]>([]);
  const [state, setState] = useState<"form" | "building" | "done">("form");
  const [done, setDone] = useState<Done | null>(null);
  const [slugFree, setSlugFree] = useState<boolean | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  const logoUrl = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => e.filter((x) => x.field !== k)); };
  const en = f.locale === "en";
  const titles = en ? TITLES_EN : TITLES_AR;

  // Live check that the site address is free.
  useEffect(() => {
    if (!/^[a-z0-9-]{3,50}$/.test(f.slug)) { setSlugFree(null); return; }
    const t = setTimeout(() => {
      fetch(`/api/signup?slug=${encodeURIComponent(f.slug)}`).then((r) => r.json()).then((r) => setSlugFree(r.ok ? r.free : null)).catch(() => setSlugFree(null));
    }, 400);
    return () => clearTimeout(t);
  }, [f.slug]);

  const err = (field: string) => errors.find((e) => e.field === field)?.message;
  const need = (cond: boolean, field: string, message: string, out: Err[]) => { if (!cond) out.push({ field, message }); };

  function check(s: number): Err[] {
    const out: Err[] = [];
    if (s === 0) {
      need(f.name.trim().length >= 2, "name", "اكتب اسمك", out);
      need(f.subject.trim().length >= 2, "subject", "اكتب المادة", out);
    }
    if (s === 2) {
      need(/^(\+?\d[\d\s-]{8,18})$/.test(f.phone.trim()), "phone", "اكتب رقم واتساب صحيح، مثل 01012345678", out);
      f.videos.filter(Boolean).forEach((v) => need(/youtu\.?be/.test(v), "videos", "الصق رابط فيديو يوتيوب", out));
    }
    if (s === 3) {
      need(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(f.slug), "slug", "حروف إنجليزية صغيرة وأرقام وشرطة، مثل mohamedali", out);
      need(slugFree !== false, "slug", "العنوان ده محجوز، جرّب عنوان تاني.", out);
      need(/^[a-z0-9._-]{3,32}$/.test(f.username), "username", "حروف إنجليزية صغيرة وأرقام، 3 حروف على الأقل", out);
      need(f.password.length >= 8, "password", "كلمة السر 8 حروف على الأقل", out);
    }
    return out;
  }

  const go = (to: number) => { setStep(to); top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  function next() {
    const out = check(step);
    setErrors(out);
    if (out.length) return;
    if (step < STEPS.length - 1) go(step + 1);
    else void submit();
  }

  async function submit() {
    setState("building");
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const fd = new FormData();
    for (const [k, v] of Object.entries(f)) if (k !== "videos") fd.set(k, String(v));
    f.videos.filter(Boolean).forEach((v) => fd.append("videos", v));
    if (photo) fd.set("photo", photo);
    if (logo) fd.set("logo", logo);
    const started = Date.now();
    try {
      const res = await fetch("/api/signup", { method: "POST", body: fd });
      const r = await res.json().catch(() => ({ ok: false, errors: [{ field: "form", message: "حصلت مشكلة، حاول تاني." }] }));
      // Let the building animation play through.
      await new Promise((ok) => setTimeout(ok, Math.max(0, 3200 - (Date.now() - started))));
      if (r.ok) { setDone(r); setState("done"); return; }
      const list: Err[] = r.errors ?? [{ field: "form", message: "حصلت مشكلة، حاول تاني." }];
      setErrors(list);
      const stepOf: Record<string, number> = { name: 0, subject: 0, title: 0, locale: 0, photo: 1, logo: 1, slogan: 1, color: 1, phone: 2, videos: 2, slug: 3, username: 3, password: 3 };
      setStep(Math.min(...list.map((e) => stepOf[e.field] ?? 3)));
      setState("form");
    } catch {
      setErrors([{ field: "form", message: "مفيش اتصال بالإنترنت؟ حاول تاني." }]);
      setState("form");
    }
  }

  const who = `${f.title} ${f.name || (en ? "Your name" : "اسمك")}`;

  return (
    <div className="su-flow" ref={top} id="start">
      {state === "done" && done ? (
        <Result done={done} password={f.password} />
      ) : state === "building" ? (
        <Building />
      ) : (
        <div className="su-grid">
          <form className="su-card" onSubmit={(e) => { e.preventDefault(); next(); }} noValidate>
            <ol className="su-steps" aria-label="الخطوات">
              {STEPS.map((s, i) => (
                <li key={s} className={i === step ? "on" : i < step ? "done" : undefined}>
                  <button type="button" disabled={i > step} onClick={() => i < step && go(i)}><span>{i < step ? "✓" : i + 1}</span>{s}</button>
                </li>
              ))}
            </ol>
            <div className="su-bar" aria-hidden="true"><i style={{ inlineSize: `${((step + 1) / STEPS.length) * 100}%` }} /></div>

            {step === 0 && (
              <fieldset className="su-fields">
                <legend>عرّفنا بيك</legend>
                <Choice label="لغة موقعك" value={f.locale} onChange={(v) => { set("locale", v as "ar-EG" | "en"); set("title", v === "en" ? "Mr." : "أ."); }} options={[["ar-EG", "عربي"], ["en", "English"]]} />
                <div className="su-row">
                  <label className="su-field su-narrow"><span>اللقب</span>
                    <select value={f.title} onChange={(e) => set("title", e.target.value)}>{titles.map((t) => <option key={t}>{t}</option>)}</select>
                  </label>
                  <Text label={en ? "Your name (in English)" : "اسمك"} value={f.name} onChange={(v) => set("name", v)} error={err("name")} placeholder={en ? "Karim Samy" : "كريم سامي"} autoComplete="name" />
                </div>
                <Text label="المادة اللي بتدرّسها" value={f.subject} onChange={(v) => set("subject", v)} error={err("subject")} placeholder={en ? "Physics" : "الفيزياء"} />
              </fieldset>
            )}

            {step === 1 && (
              <fieldset className="su-fields">
                <legend>شكل موقعك</legend>
                <div className="su-row">
                  <FilePick label="صورتك" hint="صورة واضحة ليك، يفضل بخلفية بسيطة" file={photo} url={photoUrl} onPick={setPhoto} error={err("photo")} />
                  <FilePick label="اللوجو (اختياري)" hint="لو عندك لوجو أو توقيع" file={logo} url={logoUrl} onPick={setLogo} error={err("logo")} />
                </div>
                <Text label="جملة تعريفية (اختياري)" value={f.slogan} onChange={(v) => set("slogan", v)} placeholder={en ? "Physics made simple" : "الفيزياء بقت أسهل"} max={90} />
                <div className="su-field"><span>اللون الأساسي</span>
                  <div className="su-colors">
                    {COLORS.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={f.color === c} style={{ background: c }} onClick={() => set("color", c)} />)}
                    <label className="su-custom" title="لون تاني"><input type="color" value={f.color} onChange={(e) => set("color", e.target.value.toUpperCase())} /><span>+</span></label>
                  </div>
                </div>
                <Choice label="خلفية الموقع" value={f.scheme} onChange={(v) => set("scheme", v as "light" | "dark")} options={[["light", "فاتحة"], ["dark", "غامقة"]]} />
              </fieldset>
            )}

            {step === 2 && (
              <fieldset className="su-fields">
                <legend>التواصل والفيديوهات</legend>
                <Text label="رقم الواتساب" value={f.phone} onChange={(v) => set("phone", v)} error={err("phone")} placeholder="01012345678" inputMode="tel" dir="ltr" autoComplete="tel" hint="الطلاب هيكلموك عليه من كل زرار في الموقع" />
                <div className="su-field"><span>فيديوهات يوتيوب ليك (اختياري، لحد 3)</span>
                  {f.videos.map((v, i) => (
                    <input key={i} value={v} dir="ltr" placeholder="https://youtu.be/..." inputMode="url"
                      onChange={(e) => set("videos", f.videos.map((x, j) => (j === i ? e.target.value : x)))} />
                  ))}
                  {err("videos") ? <small className="su-err">{err("videos")}</small> : <small>لو مفيش، هنحط فيديوهات تجريبية.</small>}
                </div>
              </fieldset>
            )}

            {step === 3 && (
              <fieldset className="su-fields">
                <legend>عنوان موقعك وحساب لوحة التحكم</legend>
                <label className="su-field"><span>عنوان موقعك</span>
                  <span className="su-slug" dir="ltr">
                    {before && <i>{before}</i>}
                    <input value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="mohamedali" autoCapitalize="none" spellCheck={false} />
                    {after && <i>{after}</i>}
                  </span>
                  {err("slug") ? <small className="su-err">{err("slug")}</small>
                    : slugFree === true ? <small className="su-ok">✓ العنوان متاح</small>
                    : slugFree === false ? <small className="su-err">العنوان ده محجوز</small>
                    : <small>حروف إنجليزية صغيرة وأرقام، مثل mohamedali</small>}
                </label>
                <div className="su-row">
                  <Text label="اسم المستخدم" value={f.username} onChange={(v) => set("username", v.toLowerCase().replace(/\s/g, ""))} error={err("username")} placeholder="mohamed" dir="ltr" autoComplete="username" />
                  <Text label="كلمة السر" type="password" value={f.password} onChange={(v) => set("password", v)} error={err("password")} placeholder="8 حروف على الأقل" dir="ltr" autoComplete="new-password" />
                </div>
                <p className="su-note">هتدخل بيهم لوحة التحكم وتعدّل موقعك. الموقع شغال 24 ساعة ببلاش، ومن غير أي دفع.</p>
                <input className="su-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={(e) => set("website", e.target.value)} />
              </fieldset>
            )}

            {err("form") && <p className="su-err su-form-err" role="alert">{err("form")}</p>}
            <div className="su-nav">
              {step > 0 && <button type="button" className="su-btn ghost" onClick={() => go(step - 1)}>رجوع</button>}
              <button type="submit" className="su-btn primary">{step < STEPS.length - 1 ? "التالي" : "ابني موقعي"}</button>
            </div>
          </form>

          <aside className="su-preview" aria-label="شكل موقعك">
            <div className="su-phone" style={{ ["--c" as string]: f.color }} data-scheme={f.scheme} dir={en ? "ltr" : "rtl"}>
              <div className="su-ph-top">
                {logoUrl ? <img src={logoUrl} alt="" /> : <b>{who}</b>}
                <span>{en ? "WhatsApp" : "واتساب"}</span>
              </div>
              <div className="su-ph-hero">
                <small>{f.subject || (en ? "Your subject" : "مادتك")}</small>
                <h3>{f.slogan || (en ? `Learn ${f.subject || "it"} the right way` : `ذاكر ${f.subject || "مادتك"} صح`)}</h3>
                <img src={photoUrl ?? "/demo/teacher.svg"} alt="" />
                <span className="su-ph-cta">{en ? "Book your seat" : "احجز مكانك"}</span>
              </div>
              <div className="su-ph-rows"><i /><i /><i /></div>
            </div>
            <p>ده شكل مبدئي. موقعك الحقيقي هيبقى فيه كل الأقسام بمحتوى جاهز تعدّله براحتك.</p>
          </aside>
        </div>
      )}
    </div>
  );
}

function Text(p: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; placeholder?: string; type?: string; dir?: string; inputMode?: "tel" | "url"; autoComplete?: string; max?: number }) {
  return (
    <label className="su-field">
      <span>{p.label}</span>
      <input type={p.type ?? "text"} value={p.value} onChange={(e) => p.onChange(e.target.value)} placeholder={p.placeholder} dir={p.dir} inputMode={p.inputMode} autoComplete={p.autoComplete} maxLength={p.max} aria-invalid={Boolean(p.error)} />
      {p.error ? <small className="su-err">{p.error}</small> : p.hint ? <small>{p.hint}</small> : null}
    </label>
  );
}

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="su-field"><span>{label}</span>
      <div className="su-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}

function FilePick({ label, hint, file, url, onPick, error }: { label: string; hint: string; file: File | null; url: string | null; onPick: (f: File | null) => void; error?: string }) {
  return (
    <div className="su-field su-file">
      <span>{label}</span>
      <label className={`su-drop${url ? " has" : ""}`}>
        {url ? <img src={url} alt="" /> : <b aria-hidden="true">+</b>}
        <small>{file ? file.name : hint}</small>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      </label>
      {file && <button type="button" className="su-link" onClick={() => onPick(null)}>شيل الصورة</button>}
      {error && <small className="su-err">{error}</small>}
    </div>
  );
}

const BUILD_STEPS = ["بنجهز صفحتك الرئيسية بصورتك وألوانك", "بنضيف المواعيد والامتحانات ولوحة الشرف", "بنعمل اختبار وتصويت ورابط شريك تجريبي", "بنفتحلك لوحة التحكم"];

function Building() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, BUILD_STEPS.length - 1)), 800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="su-card su-building" role="status" aria-live="polite">
      <div className="su-spinner" aria-hidden="true" />
      <h2>بنبني موقعك…</h2>
      <ul>{BUILD_STEPS.map((s, j) => <li key={s} className={j < i ? "done" : j === i ? "on" : undefined}><span>{j < i ? "✓" : ""}</span>{s}</li>)}</ul>
    </div>
  );
}

function Result({ done, password }: { done: Done; password: string }) {
  const [copied, setCopied] = useState(false);
  const ends = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: "Africa/Cairo" }).format(new Date(done.endsAt));
  const [site, ...rest] = done.links;
  return (
    <div className="su-card su-result">
      <span className="su-badge">✓ موقعك جاهز</span>
      <h2>اتفضل، ده موقعك</h2>
      <a className="su-site" href={site.href} target="_blank" rel="noopener" dir="ltr">{site.href.replace(/^https?:\/\//, "")}</a>
      <div className="su-actions">
        <a className="su-btn primary" href={site.href} target="_blank" rel="noopener">افتح موقعك</a>
        <button type="button" className="su-btn ghost" onClick={() => { void navigator.clipboard?.writeText(site.href).then(() => setCopied(true)); }}>{copied ? "اتنسخ ✓" : "انسخ الرابط"}</button>
      </div>
      <p className="su-note">الموقع ولوحة التحكم شغالين لحد <b>{ends}</b> (24 ساعة). عجبك؟ كلمنا وهنفعّله ليك على طول.</p>

      <h3>جرّب كل حاجة</h3>
      <ul className="su-links">
        {rest.map((l) => (
          <li key={l.href}><a href={l.href} target="_blank" rel="noopener"><b>{l.label}</b><small dir="ltr">{l.href.replace(/^https?:\/\//, "")}</small></a></li>
        ))}
      </ul>

      <div className="su-login">
        <h3>دخول لوحة التحكم</h3>
        <dl>
          <div><dt>الرابط</dt><dd dir="ltr"><a href={`${site.href.replace(/\/$/, "")}/admin`} target="_blank" rel="noopener">{`${site.href.replace(/^https?:\/\//, "").replace(/\/$/, "")}/admin`}</a></dd></div>
          <div><dt>اسم المستخدم</dt><dd dir="ltr">{done.username}</dd></div>
          <div><dt>كلمة السر</dt><dd dir="ltr">{password.replace(/./g, "•")} <small>(اللي كتبتها)</small></dd></div>
        </dl>
        <p className="su-note">من لوحة التحكم تقدر تغيّر أي كلمة أو صورة، تشوف الطلبات والإحصائيات، وتعمل اختبارات وتصويتات جديدة.</p>
      </div>
    </div>
  );
}
