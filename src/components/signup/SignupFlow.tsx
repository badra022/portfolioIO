"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cutout, preloadCutout, type Cutout } from "@/lib/cutout";
import { COUNTRIES, DEFAULT_COUNTRY, countryOf, normalizePhone } from "@/lib/phone";
import type { PartnerForm } from "@/lib/partners";
import { DEVELOPER } from "@/lib/platform";

/**
 * The public «جرّب موقعك» form on the platform's home page (the page paid ads
 * point to): four short steps, then the site is built (api/signup) and every link
 * to try is listed. The site and its admin login work for 24 hours.
 * The WhatsApp number is confirmed with a code first when codes are on
 * (lib/server/otp.ts), and the photo's background is removed in the browser
 * (lib/cutout.ts).
 *
 * On a partner's private page (<platform>/<partner>, lib/server/partners.ts) the
 * same form builds as many sites as the partner wants for its clients: no phone
 * code or terms, the partner's own extra questions, and «اعمل موقع تاني» after each.
 */
type Err = { field: string; message: string };
type Done = { base: string; endsAt: string; hours?: number; username: string; links: { label: string; href: string }[] };
export type SignupPartner = { slug: string; name: string; hours: number; form: PartnerForm };
type Built = { base: string; endsAt: string | null };

/** The address shape the server accepts (lib/server/admin-ops.ts SLUG_RE), 3 letters at least. */
const SLUG_SHAPE = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/;

/* The built site's links, kept in this browser so a reload shows them instead of a new form (never the password). */
const SAVED = "ostaz-trial-v1";
function save(d: Done) {
  try { localStorage.setItem(SAVED, JSON.stringify({ base: d.base, endsAt: d.endsAt, username: d.username, links: d.links })); } catch {}
}
function readSaved(): Done | null {
  try {
    const d = JSON.parse(localStorage.getItem(SAVED) ?? "null") as Done | null;
    return d && typeof d.base === "string" && Array.isArray(d.links) && d.links.length ? d : null;
  } catch { return null; }
}

const TITLES_AR = ["أ.", "م.", "د.", "مستر", "ميس"];
const TITLES_EN = ["Mr.", "Ms.", "Dr."];
const COLORS = ["#1D6FE0", "#0EA5E9", "#16A34A", "#E3171F", "#F59E0B", "#7C3AED", "#DB2777", "#0F766E"];
const STEPS = ["عنك", "شكل موقعك", "التواصل والفيديوهات", "حساب لوحة التحكم"];

/** How long each building step shows at least (ms), ~18 s in all, so the build feels like real work. */
const BUILD_MS = [4500, 5000, 4500, 4000];
const sleepUntil = (t: number) => new Promise((ok) => setTimeout(ok, Math.max(0, t - Date.now())));

/**
 * The site address around the slug: «mohamedali» + after, e.g. ".ostaz.io", or before "ostaz.io/t/".
 * otp: how the confirmation code is sent, or false when codes are off.
 * partner: the partner whose page this is (its own endpoints, fields and trial length).
 */
export function SignupFlow({ before, after, otp, partner }: { before: string; after: string; otp: false | "sms" | "whatsapp"; partner?: SignupPartner }) {
  const api = partner ? `/${partner.slug}/build` : "/api/signup";
  const trackUrl = partner ? `/${partner.slug}/track` : "/api/signup/track";
  const blank = () => ({
    title: "أ.", name: "", subject: "", locale: "ar-EG" as "ar-EG" | "en",
    slogan: "", color: partner?.form.color || COLORS[0], scheme: "light" as "light" | "dark",
    country: DEFAULT_COUNTRY, phone: "", videos: ["", "", ""], slug: "", username: "", password: "", website: "", terms: false, notes: "",
  });
  const [step, setStep] = useState(0);
  const [f, setF] = useState(blank);
  // Answers to the partner's extra fields, by field id.
  const [extra, setExtra] = useState<Record<string, string>>({});
  const extraFields = partner?.form.fields ?? [];
  const [photo, setPhoto] = useState<File | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [errors, setErrors] = useState<Err[]>([]);
  const [state, setState] = useState<"form" | "building" | "done" | "already">("form");
  const [done, setDone] = useState<Done | null>(null);
  // The trial this browser already made (its cookie, api/signup?me=1): one per device.
  const [already, setAlready] = useState<Built | null>(null);
  // The live address check, for the address it was made for.
  const [slugCheck, setSlugCheck] = useState<{ slug: string; free: boolean; message: string } | null>(null);
  // The photo without its background: being made, made (null = no person found / failed), and whether to use it.
  const [cut, setCut] = useState<{ busy: boolean; result: Cutout | null }>({ busy: false, result: null });
  const [useCut, setUseCut] = useState(true);
  const cutJob = useRef<Promise<Cutout | null> | null>(null);
  // Phone confirmation: the number a code was sent to, the code typed, and the proof once it's right.
  const [codeFor, setCodeFor] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState<{ phone: string; token: string } | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [buildStage, setBuildStage] = useState(0);
  const [buildStart, setBuildStart] = useState(0);
  const top = useRef<HTMLDivElement>(null);
  const originalUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  const photoUrl = useCut && cut.result ? cut.result.url : originalUrl;
  const logoUrl = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => e.filter((x) => x.field !== k)); };
  const en = f.locale === "en";
  const titles = en ? TITLES_EN : TITLES_AR;

  // The home page's funnel (lib/server/funnel.ts): the view and each step reached, once per page load.
  const tracked = useRef(new Set<string>());
  const track = (...events: string[]) => {
    const fresh = events.filter((e) => !tracked.current.has(e));
    if (!fresh.length || navigator.webdriver) return;
    fresh.forEach((e) => tracked.current.add(e));
    const body = JSON.stringify({ e: fresh });
    // A partner's page is behind its login: a beacon can't answer the login prompt, a fetch can.
    if (partner || !navigator.sendBeacon?.(trackUrl, body)) void fetch(trackUrl, { method: "POST", body, keepalive: true }).catch(() => {});
  };
  useEffect(() => { track("view"); }, []);
  useEffect(() => { if (state === "form") track(`step:${step + 1}`); }, [step, state]);

  // A site built from this browser before: show it instead of a new form (partners build many).
  useEffect(() => {
    if (partner) return;
    const saved = readSaved();
    if (saved) { setDone(saved); setState("done"); return; }
    fetch("/api/signup?me=1").then((r) => r.json()).then((r) => { if (r.ok && r.built) { setAlready(r.built); setState("already"); } }).catch(() => {});
  }, []);

  const slugShapeOk = SLUG_SHAPE.test(f.slug);
  const checkSlug = (slug: string) =>
    fetch(`${api}?slug=${encodeURIComponent(slug)}`).then((r) => r.json())
      .then((r) => { const c = { slug, free: Boolean(r.ok && r.free), message: String(r.message ?? "") }; setSlugCheck(c); return c; })
      .catch(() => null);
  // Live check that the site address is free; a result only counts for the address it was made for.
  useEffect(() => {
    if (!slugShapeOk) return;
    const t = setTimeout(() => { void checkSlug(f.slug); }, 350);
    return () => clearTimeout(t);
  }, [f.slug, slugShapeOk]);
  const slugNow = slugCheck?.slug === f.slug ? slugCheck : null;
  const phoneKey = normalizePhone(f.country, f.phone) ?? "";
  const country = countryOf(f.country) ?? COUNTRIES[0];

  function pickPhoto(file: File | null) {
    setPhoto(file);
    setErrors((e) => e.filter((x) => x.field !== "photo"));
    setCut({ busy: Boolean(file), result: null });
    setUseCut(true);
    if (!file) { cutJob.current = null; return; }
    const job = cutout(file).catch(() => null);
    cutJob.current = job;
    void job.then((result) => { if (cutJob.current === job) setCut({ busy: false, result }); });
  }

  const err = (field: string) => errors.find((e) => e.field === field)?.message;
  const need = (cond: boolean, field: string, message: string, out: Err[]) => { if (!cond) out.push({ field, message }); };

  function check(s: number): Err[] {
    const out: Err[] = [];
    if (s === 0) {
      need(f.name.trim().length >= 2, "name", "اكتب اسمك", out);
      need(f.subject.trim().length >= 2, "subject", "اكتب المادة", out);
    }
    if (s === 2) {
      need(Boolean(phoneKey), "phone", `اكتب رقم موبايل واتساب صحيح، مثل ${country.example}`, out);
      f.videos.filter(Boolean).forEach((v) => need(/youtu\.?be/.test(v), "videos", "الصق رابط فيديو يوتيوب", out));
    }
    if (s === 3) {
      need(slugShapeOk, "slug", "حروف إنجليزية صغيرة وأرقام وشرطة في النص، 3 حروف على الأقل، مثل mohamedali", out);
      need(/^[a-z0-9._-]{3,32}$/.test(f.username), "username", "حروف إنجليزية صغيرة وأرقام، 3 حروف على الأقل", out);
      need(f.password.length >= 8, "password", "كلمة السر 8 حروف على الأقل", out);
      if (!partner) need(f.terms, "terms", "لازم توافق على شروط التجربة", out);
      for (const x of extraFields) if (x.required) need(Boolean(extra[x.id]?.trim()), `x:${x.id}`, `اكتب «${x.label}»`, out);
    }
    return out;
  }

  const go = (to: number) => { setStep(to); top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  async function otpCall(body: Record<string, string>): Promise<{ ok: boolean; skip?: boolean; token?: string; message?: string }> {
    setBusy(true);
    try {
      const res = await fetch("/api/signup/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return await res.json().catch(() => ({ ok: false, message: "حصلت مشكلة، حاول تاني." }));
    } catch {
      return { ok: false, message: "مفيش اتصال بالإنترنت؟ حاول تاني." };
    } finally {
      setBusy(false);
    }
  }

  /** Step 3: the number is checked (one trial per number), then confirmed with a code when codes are on. */
  async function confirmPhone(): Promise<boolean> {
    // Partners: one number may make many trials, and no code is sent.
    if (partner) return true;
    const phone = phoneKey;
    if (token?.phone === phone) return true;
    if (codeFor !== phone) {
      const r = await otpCall({ action: "send", country: f.country, phone: f.phone });
      if (!r.ok) { setErrors([{ field: "phone", message: r.message ?? "حصلت مشكلة، حاول تاني." }]); return false; }
      if (r.skip) { setToken({ phone, token: "" }); return true; }
      setCodeFor(phone); setCode(""); setResendAt(Date.now() + 60_000);
      return false;
    }
    if (!/^\d{4,8}$/.test(code.trim())) { setErrors([{ field: "code", message: "اكتب الكود اللي وصلك" }]); return false; }
    const r = await otpCall({ action: "check", country: f.country, phone: f.phone, code: code.trim() });
    if (!r.ok || !r.token) { setErrors([{ field: "code", message: r.message ?? "الكود مش صح" }]); return false; }
    setToken({ phone, token: r.token });
    return true;
  }

  async function resend() {
    const r = await otpCall({ action: "send", country: f.country, phone: f.phone });
    if (!r.ok) setErrors([{ field: "code", message: r.message ?? "حصلت مشكلة، حاول تاني." }]);
    else { setCode(""); setResendAt(Date.now() + 60_000); setErrors([]); }
  }

  async function next() {
    if (busy) return;
    const out = check(step);
    // The address is checked again right before building, in case it was typed a moment ago.
    if (step === 3 && slugShapeOk) {
      setBusy(true);
      const c = slugNow ?? (await checkSlug(f.slug));
      setBusy(false);
      if (c && !c.free) out.unshift({ field: "slug", message: c.message || "العنوان ده مستخدم بالفعل، جرّب عنوان تاني." });
    }
    setErrors(out);
    if (out.length) return;
    if (step === 2 && !(await confirmPhone())) return;
    if (step < STEPS.length - 1) go(step + 1);
    else void submit();
  }

  /**
   * Building takes ~18 s on screen in four steps (BUILD_MS): the photo is finished
   * first (its background removal may still be running), then the site is made
   * while the remaining steps play.
   */
  async function submit() {
    const t0 = Date.now();
    track("submit");
    setState("building"); setBuildStage(0); setBuildStart(t0);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const at = (n: number) => t0 + BUILD_MS.slice(0, n).reduce((a, b) => a + b, 0);
    const fail = (list: Err[]) => {
      setErrors(list);
      const stepOf: Record<string, number> = { name: 0, subject: 0, title: 0, locale: 0, photo: 1, logo: 1, slogan: 1, color: 1, phone: 2, videos: 2, slug: 3, username: 3, password: 3, terms: 3 };
      setStep(Math.min(...list.map((e) => stepOf[e.field] ?? 3)));
      setState("form");
    };
    let photoFile: File | null = photo, photoCut = false;
    if (photo && useCut) {
      const made = cut.result ?? (cutJob.current ? await Promise.race([cutJob.current, new Promise<null>((ok) => setTimeout(() => ok(null), 25_000))]) : null);
      if (made) { photoFile = made.file; photoCut = true; }
    }
    await sleepUntil(at(1)); setBuildStage(1);

    const fd = new FormData();
    for (const [k, v] of Object.entries(f)) if (k !== "videos" && k !== "terms") fd.set(k, String(v));
    f.videos.filter(Boolean).forEach((v) => fd.append("videos", v));
    fd.set("terms", f.terms ? "1" : "");
    fd.set("phoneToken", token?.phone === phoneKey ? token.token : "");
    if (photoFile) fd.set("photo", photoFile);
    if (photoCut) fd.set("photoCut", "1");
    if (logo) fd.set("logo", logo);
    for (const x of extraFields) if (extra[x.id]?.trim()) fd.set(`x:${x.id}`, extra[x.id].trim());
    try {
      const res = await fetch(api, { method: "POST", body: fd });
      const r = await res.json().catch(() => ({ ok: false, errors: [{ field: "form", message: "حصلت مشكلة، حاول تاني." }] }));
      if (!r.ok && r.built) { setAlready(r.built); setState("already"); return; }
      if (!r.ok) { fail(r.errors ?? [{ field: "form", message: "حصلت مشكلة، حاول تاني." }]); return; }
      await sleepUntil(at(2)); setBuildStage(2);
      await sleepUntil(at(3)); setBuildStage(3);
      await sleepUntil(at(4)); setBuildStage(4);
      await new Promise((ok) => setTimeout(ok, 600));
      if (!partner) save(r);
      setDone(r); setState("done");
    } catch {
      fail([{ field: "form", message: "مفيش اتصال بالإنترنت؟ حاول تاني." }]);
    }
  }

  const who = `${f.title} ${f.name || (en ? "Your name" : "اسمك")}`;

  return (
    <div className="su-flow" ref={top} id="start">
      {state === "already" && already ? (
        <AlreadyBuilt built={already} />
      ) : state === "done" && done ? (
        <Result done={done} password={f.password} partner={partner} onAgain={() => {
          setF(blank()); setExtra({}); setPhoto(null); setLogo(null); setCut({ busy: false, result: null }); setErrors([]); setStep(0); setDone(null); setState("form");
          tracked.current.delete("step:1"); top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }} />
      ) : state === "building" ? (
        <Building stage={buildStage} start={buildStart} />
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
                  <div className="su-photo-col">
                    <FilePick label="صورتك" hint="صورة واضحة ليك من الوسط لفوق" file={photo} url={photoUrl} onPick={pickPhoto} error={err("photo")} cut={useCut && Boolean(cut.result)} />
                    {photo && (cut.busy ? <small className="su-cut-note"><i className="su-dot" aria-hidden="true" />بنشيل خلفية الصورة…</small>
                      : cut.result ? (
                        <label className="su-check sm">
                          <input type="checkbox" checked={useCut} onChange={(e) => setUseCut(e.target.checked)} />
                          <span>شيل الخلفية وحط ألوان موقعك وراك</span>
                        </label>
                      ) : <small className="su-cut-note">هنستخدم الصورة زي ما هي.</small>)}
                  </div>
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
                <label className="su-field"><span>رقم الواتساب</span>
                  <span className="su-tel" dir="ltr">
                    <select aria-label="البلد" value={f.country} onChange={(e) => { set("country", e.target.value); setCodeFor(""); }}>
                      {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} +{c.code} {c.name}</option>)}
                    </select>
                    <input value={f.phone} onChange={(e) => { set("phone", e.target.value); setCodeFor(""); }} placeholder={country.example} inputMode="tel" autoComplete="tel-national" aria-invalid={Boolean(err("phone"))} />
                  </span>
                  {err("phone") ? <small className="su-err">{err("phone")}</small>
                    : <small>{partner ? "رقم واتساب المدرس: الطلاب هيكلموه عليه من كل زرار في الموقع." : token?.phone === phoneKey && token.token ? "✓ الرقم متأكد" : otp ? `الطلاب هيكلموك عليه من كل زرار في الموقع. هنبعتلك كود ${otp === "whatsapp" ? "على واتساب" : "في رسالة"} نتأكد بيه.` : "الطلاب هيكلموك عليه من كل زرار في الموقع. رقم واحد لكل موقع تجريبي."}</small>}
                </label>
                {codeFor && codeFor === phoneKey && token?.phone !== codeFor && (
                  <div className="su-code">
                    <Text label={`الكود اللي وصلك ${otp === "whatsapp" ? "على واتساب" : "في رسالة"}`} value={code} onChange={(v) => { setCode(v.replace(/\D/g, "").slice(0, 8)); setErrors((e) => e.filter((x) => x.field !== "code")); }}
                      error={err("code")} placeholder="123456" inputMode="tel" dir="ltr" autoComplete="one-time-code" />
                    <p className="su-code-actions">
                      <ResendButton at={resendAt} onClick={() => void resend()} disabled={busy} />
                      <button type="button" className="su-link" onClick={() => { setCodeFor(""); setCode(""); }}>غيّر الرقم</button>
                    </p>
                  </div>
                )}
                {!partner?.form.hideVideos && <div className="su-field"><span>فيديوهات يوتيوب ليك (اختياري، لحد 3)</span>
                  {f.videos.map((v, i) => (
                    <input key={i} value={v} dir="ltr" placeholder="https://youtu.be/..." inputMode="url"
                      onChange={(e) => set("videos", f.videos.map((x, j) => (j === i ? e.target.value : x)))} />
                  ))}
                  {err("videos") ? <small className="su-err">{err("videos")}</small> : <small>لو مفيش، هنحط فيديوهات تجريبية.</small>}
                </div>}
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
                    : !slugShapeOk ? <small>حروف إنجليزية صغيرة وأرقام، مثل mohamedali</small>
                    : !slugNow ? <small className="su-muted">بنشوف العنوان متاح ولا لأ…</small>
                    : slugNow.free ? <small className="su-ok">✓ العنوان متاح</small>
                    : <small className="su-err">{slugNow.message || "العنوان ده مستخدم بالفعل"}</small>}
                </label>
                <div className="su-row">
                  <Text label="اسم المستخدم" value={f.username} onChange={(v) => set("username", v.toLowerCase().replace(/\s/g, ""))} error={err("username")} placeholder="mohamed" dir="ltr" autoComplete="username" />
                  <Text label="كلمة السر" type="password" value={f.password} onChange={(v) => set("password", v)} error={err("password")} placeholder="8 حروف على الأقل" dir="ltr" autoComplete="new-password" />
                </div>
                <p className="su-note">{partner
                  ? `حساب المدرس للوحة التحكم (وانت كمان تقدر تدخلها بحسابك). الموقع التجريبي شغال ${hoursText(partner.hours)}.`
                  : "هتدخل بيهم لوحة التحكم وتعدّل موقعك. الموقع شغال 24 ساعة ببلاش، ومن غير أي دفع."}</p>
                {extraFields.map((x) => <ExtraField key={x.id} field={x} value={extra[x.id] ?? ""} error={err(`x:${x.id}`)}
                  onChange={(v) => { setExtra((e) => ({ ...e, [x.id]: v })); setErrors((e) => e.filter((y) => y.field !== `x:${x.id}`)); }} />)}
                <label className="su-field"><span>ملاحظات أو طلبات خاصة <em className="su-opt">(اختياري)</em></span>
                  <textarea rows={3} maxLength={1000} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="مثلاً: عايز قسم للحصص الأونلاين، أو عندي سنتر وعايز موقع ليه" />
                  <small>{partner ? "بتظهر لإدارة المنصة مع الطلب." : "بنقراها بنفسنا، وبتساعدنا نجهّزلك الموقع زي ما انت عايز."}</small>
                </label>
                {!partner && <label className="su-check">
                  <input type="checkbox" checked={f.terms} onChange={(e) => set("terms", e.target.checked)} aria-invalid={Boolean(err("terms"))} />
                  <span>موافق على <a href="/terms" target="_blank" rel="noopener">شروط التجربة</a>: التصميم والمحتوى الجاهز ملك المنصة، ومش هنسخه أو نديه لحد يعمل زيه.</span>
                </label>}
                {err("terms") && <small className="su-err">{err("terms")}</small>}
                <input className="su-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={(e) => set("website", e.target.value)} />
              </fieldset>
            )}

            {err("form") && <p className="su-err su-form-err" role="alert">{err("form")}</p>}
            <div className="su-nav">
              {step > 0 && <button type="button" className="su-btn ghost" onClick={() => go(step - 1)}>رجوع</button>}
              <button type="submit" className="su-btn primary" disabled={busy}>
                {busy ? "لحظة…" : step === 2 && codeFor && codeFor === phoneKey && token?.phone !== codeFor ? "أكّد الكود" : step < STEPS.length - 1 ? "التالي" : partner ? "ابني الموقع" : "ابني موقعي"}
              </button>
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
                <span className={useCut && cut.result ? "su-ph-photo cut" : "su-ph-photo"}><img src={photoUrl ?? "/demo/teacher.svg"} alt="" /></span>
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

function FilePick({ label, hint, file, url, onPick, error, cut }: { label: string; hint: string; file: File | null; url: string | null; onPick: (f: File | null) => void; error?: string; cut?: boolean }) {
  return (
    <div className="su-field su-file">
      <span>{label}</span>
      <label className={`su-drop${url ? " has" : ""}${cut ? " cut" : ""}`} onPointerEnter={label === "صورتك" ? preloadCutout : undefined}>
        {url ? <img src={url} alt="" /> : <b aria-hidden="true">+</b>}
        <small>{file ? file.name : hint}</small>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      </label>
      {file && <button type="button" className="su-link" onClick={() => onPick(null)}>شيل الصورة</button>}
      {error && <small className="su-err">{error}</small>}
    </div>
  );
}

const BUILD_STEPS = [
  "بنجهّز صورتك ونظبطها على ألوان موقعك",
  "بنكتب محتوى موقعك بمادتك وأسلوبك",
  "بنضيف المواعيد والامتحانات والاختبار والتصويت",
  "بنجهّز لوحة التحكم وروابط التجربة",
];

/** Four steps, each with its own spinner, and a bar that fills over the whole build (BUILD_MS). */
function Building({ stage, start }: { stage: number; start: number }) {
  const total = BUILD_MS.reduce((a, b) => a + b, 0);
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  const pct = stage >= BUILD_STEPS.length ? 100 : Math.min(96, Math.round(((now - start) / total) * 100));
  return (
    <div className="su-card su-building" role="status" aria-live="polite">
      <div className="su-spinner" aria-hidden="true" />
      <h2>بنبني موقعك…</h2>
      <div className="su-progress" aria-label={`${pct}%`}><i style={{ inlineSize: `${pct}%` }} /><b>{pct}%</b></div>
      <ul>
        {BUILD_STEPS.map((s, j) => (
          <li key={s} className={j < stage ? "done" : j === stage ? "on" : undefined}>
            <span>{j < stage ? "✓" : j === stage ? <i className="su-mini-spin" aria-hidden="true" /> : ""}</span>{s}
          </li>
        ))}
      </ul>
      <p className="su-note">ده بياخد أقل من دقيقة. متقفلش الصفحة.</p>
    </div>
  );
}

function ResendButton({ at, onClick, disabled }: { at: number; onClick: () => void; disabled: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (now >= at) return;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [now, at]);
  const left = Math.ceil((at - now) / 1000);
  return left > 0
    ? <span className="su-muted">تقدر تطلب كود جديد بعد {left} ثانية</span>
    : <button type="button" className="su-link" onClick={() => { onClick(); setNow(Date.now()); }} disabled={disabled}>ابعت الكود تاني</button>;
}

/** 24 → «24 ساعة», 72 → «3 أيام». */
function hoursText(h: number): string {
  if (h % 24 || h < 48) return `${h} ساعة`;
  const d = h / 24;
  return d <= 10 ? `${d} أيام` : `${d} يوم`;
}

function ExtraField({ field: x, value, onChange, error }: { field: PartnerForm["fields"][number]; value: string; onChange: (v: string) => void; error?: string }) {
  const label = <span>{x.label}{!x.required && <em className="su-opt"> (اختياري)</em>}</span>;
  return (
    <label className="su-field">
      {label}
      {x.type === "textarea" ? <textarea rows={3} maxLength={2000} value={value} onChange={(e) => onChange(e.target.value)} placeholder={x.placeholder} aria-invalid={Boolean(error)} />
        : x.type === "select" ? (
          <select value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)}>
            <option value="">اختار…</option>
            {x.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        ) : <input type={x.type === "number" ? "number" : x.type === "date" ? "date" : "text"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={x.placeholder} maxLength={200} aria-invalid={Boolean(error)} />}
      {error && <small className="su-err">{error}</small>}
    </label>
  );
}

function Result({ done, password, partner, onAgain }: { done: Done; password: string; partner?: SignupPartner; onAgain: () => void }) {
  const [copied, setCopied] = useState(false);
  const ends = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", ...(partner ? { day: "numeric", month: "long" } : {}), hour: "numeric", minute: "2-digit", timeZone: "Africa/Cairo" }).format(new Date(done.endsAt));
  const [site, ...rest] = done.links;
  return (
    <div className="su-card su-result">
      <span className="su-badge">✓ {partner ? "الموقع جاهز" : "موقعك جاهز"}</span>
      <h2>{partner ? "اتفضل، ده موقع عميلك" : "اتفضل، ده موقعك"}</h2>
      <a className="su-site" href={site.href} target="_blank" rel="noopener" dir="ltr">{site.href.replace(/^https?:\/\//, "")}</a>
      <div className="su-actions">
        <a className="su-btn primary" href={site.href} target="_blank" rel="noopener">افتح موقعك</a>
        <button type="button" className="su-btn ghost" onClick={() => { void navigator.clipboard?.writeText(site.href).then(() => setCopied(true)); }}>{copied ? "اتنسخ ✓" : "انسخ الرابط"}</button>
      </div>
      {partner
        ? <p className="su-note">الموقع ولوحة التحكم شغالين لحد <b>{ends}</b> ({hoursText(done.hours ?? partner.hours)}). ابعت الرابط لعميلك وخد رأيه، وكلمنا لما يحب يفعّله.</p>
        : <p className="su-note">الموقع ولوحة التحكم شغالين لحد <b>{ends}</b> (24 ساعة). عجبك؟ كلمنا وهنفعّله ليك على طول.</p>}
      {partner && <div className="su-actions"><button type="button" className="su-btn primary" onClick={onAgain}>اعمل موقع تاني</button></div>}

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
          <div><dt>كلمة السر</dt><dd dir="ltr">{password ? password.replace(/./g, "•") : "••••••••"} <small>(اللي كتبتها)</small></dd></div>
        </dl>
        <p className="su-note">من لوحة التحكم تقدر تغيّر أي كلمة أو صورة، تشوف الطلبات والإحصائيات، وتعمل اختبارات وتصويتات جديدة.</p>
      </div>
    </div>
  );
}

/** This browser already made a trial site: one per device. */
function AlreadyBuilt({ built }: { built: Built }) {
  const host = built.base.replace(/^https?:\/\//, "");
  return (
    <div className="su-card su-result">
      <span className="su-badge">عندك موقع تجريبي</span>
      <h2>عملت موقعك التجريبي من الجهاز ده قبل كده</h2>
      <a className="su-site" href={built.base} target="_blank" rel="noopener" dir="ltr">{host}</a>
      <div className="su-actions">
        <a className="su-btn primary" href={built.base} target="_blank" rel="noopener">افتح موقعك</a>
        <a className="su-btn ghost" href={`${built.base.replace(/\/$/, "")}/admin`} target="_blank" rel="noopener">لوحة التحكم</a>
      </div>
      <p className="su-note">كل جهاز ورقم ليهم موقع تجريبي واحد. عجبك؟ <a href={`https://wa.me/${DEVELOPER.whatsapp}`} target="_blank" rel="noopener">كلمنا على واتساب</a> ونفعّله ليك على طول.</p>
    </div>
  );
}
