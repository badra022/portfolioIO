"use client";

import { useEffect, useId, useRef, useState } from "react";
import { defaultFor, isComplex, kindOf, unwrap, type JS } from "@/lib/admin/schema-tools";
import { enumLabel, hintFor, labelFor, sectionEnumLabel } from "@/lib/admin/labels";
import { shrinkForUpload } from "@/lib/shrink-image";
import { cutout } from "@/lib/cutout";

export type UploadResult = { ok: true; key: string; url: string } | { ok: false; error: string };
export type FormCtx = {
  errors: Record<string, string>;
  /** Base URL of this teacher's files, used to preview image keys. */
  assetBase: string;
  upload: (file: File) => Promise<UploadResult>;
  /** The teacher's forms, offered wherever a button can open a form instead of WhatsApp. */
  forms?: { id: string; title: string }[];
};

type FieldProps = {
  s: JS;
  value: unknown;
  onChange: (v: unknown) => void;
  path: string;
  name: string;
  required: boolean;
  ctx: FormCtx;
  depth: number;
  bare?: boolean;
};

const HIDDEN = new Set(["$schema", "slug"]);
const LONG_TEXT = new Set(["text", "intro", "message", "description", "note", "caption", "question", "answer", "replyNote"]);
const LTR = new Set(["whatsapp", "telegram", "messenger", "id", "ref", "locale", "href", "url", "channelUrl", "googleFontsHref", "refLabel", "display", "body", "numeric", "card", "control", "pill", "notePhone"]);
/** Fields long enough that their item deserves a card and a pop-up (not "text": title pieces stay inline). */
const LONG_FIELDS = new Set(["answer", "question", "description", "message", "intro", "note", "caption"]);
const TIME_PATTERN = "^\\d{2}:\\d{2}$";

/** Renders a form for an object schema; each top-level key becomes a card. */
export function SchemaForm({ schema, value, onChange, ctx }: { schema: JS; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void; ctx: FormCtx }) {
  return (
    <div className="sf">
      <ObjectFields s={schema} value={value} onChange={(v) => onChange(v as Record<string, unknown>)} path="" ctx={ctx} depth={0} />
    </div>
  );
}

function Label({ path, name, required }: { path: string; name: string; required?: boolean }) {
  return <span className="f-label">{labelFor(path, name)}{required === false ? <em className="f-opt"> (اختياري)</em> : null}</span>;
}

function Hint({ path }: { path: string }) {
  const h = hintFor(path);
  return h ? <p className="f-hint">{h}</p> : null;
}

function ErrorText({ ctx, path }: { ctx: FormCtx; path: string }) {
  const e = ctx.errors[path];
  return e ? <p className="f-err" role="alert">{e}</p> : null;
}

const join = (path: string, key: string | number) => (path ? `${path}.${key}` : String(key));

function Field(props: FieldProps) {
  const { s, value, onChange, path, name, required, ctx, depth, bare } = props;
  const { inner, nullable } = unwrap(s);
  const id = useId();

  if (nullable) {
    const on = value !== null && value !== undefined;
    return (
      <div className="f-nullable">
        <label className="f-check">
          <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? defaultFor({ ...inner, default: undefined }) : null)} />
          <Label path={path} name={name} />
        </label>
        <Hint path={path} />
        {on && <Field {...props} s={inner} bare />}
        <ErrorText ctx={ctx} path={path} />
      </div>
    );
  }

  const kind = kindOf(inner);
  if (kind === "object") {
    if (bare && depth > 0) return <ObjectFields s={inner} value={value} onChange={onChange} path={path} ctx={ctx} depth={depth} />;
    return (
      <fieldset className={`f-group d${Math.min(depth, 3)}`}>
        <legend><Label path={path} name={name} /></legend>
        <Hint path={path} />
        <ErrorText ctx={ctx} path={path} />
        <ObjectFields s={inner} value={value} onChange={onChange} path={path} ctx={ctx} depth={depth + 1} />
      </fieldset>
    );
  }
  if (kind === "record") return <RecordField {...props} s={inner} />;
  if (kind === "array") return <ArrayField {...props} s={inner} />;

  const control = (() => {
    switch (kind) {
      case "enum":
        return (
          <select id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}>
            {!required && <option value="">{name === "style" ? "عادي" : "—"}</option>}
            {inner.enum!.map((o) => <option key={String(o)} value={String(o)}>{enumLabel(String(o), name)}</option>)}
          </select>
        );
      case "string":
        return <StringInput id={id} s={inner} value={value as string | undefined} onChange={onChange} name={name} path={path} required={required} ctx={ctx} />;
      case "number":
        return (
          <input id={id} type="number" step="any" dir="ltr" value={value === undefined || value === null ? "" : String(value)}
            onChange={(e) => onChange(e.target.value === "" ? (required ? 0 : undefined) : Number(e.target.value))} />
        );
      case "boolean":
        return null;
      default:
        return <JsonInput value={value} onChange={onChange} />;
    }
  })();

  if (kind === "boolean") {
    return (
      <div className="f-field">
        <label className="f-check">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          <Label path={path} name={name} />
        </label>
        <Hint path={path} />
        <ErrorText ctx={ctx} path={path} />
      </div>
    );
  }

  return (
    <div className="f-field">
      {!bare && <label htmlFor={id}><Label path={path} name={name} required={required ? undefined : false} /></label>}
      {control}
      <Hint path={path} />
      <ErrorText ctx={ctx} path={path} />
    </div>
  );
}

function ObjectFields({ s, value, onChange, path, ctx, depth }: { s: JS; value: unknown; onChange: (v: unknown) => void; path: string; ctx: FormCtx; depth: number }) {
  const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const set = (key: string, v: unknown) => {
    const next = { ...obj };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  };
  return (
    <div className="f-fields">
      {Object.entries(s.properties ?? {}).filter(([k]) => !HIDDEN.has(k)).map(([key, ps]) => {
        const required = Boolean(s.required?.includes(key)) || ps.default !== undefined;
        const childPath = join(path, key);
        const v = obj[key];
        if (!required && v === undefined && isComplex(ps)) {
          return (
            <div key={key} className="f-missing">
              <button type="button" className="f-add" onClick={() => set(key, defaultFor(unwrap(ps).inner))}>
                + إضافة {labelFor(childPath, key)}
              </button>
              <ErrorText ctx={ctx} path={childPath} />
            </div>
          );
        }
        return (
          <div key={key} className="f-slot">
            <Field s={ps} value={v} onChange={(nv) => set(key, nv)} path={childPath} name={key} required={required} ctx={ctx} depth={depth} />
            {!required && isComplex(ps) && (
              <button type="button" className="f-link danger" onClick={() => set(key, undefined)}>إزالة {labelFor(childPath, key)}</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RecordField({ s, value, onChange, path, name, ctx, depth }: FieldProps) {
  const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const valueSchema = (s.additionalProperties && typeof s.additionalProperties === "object" ? s.additionalProperties : { type: "string" }) as JS;
  return (
    <fieldset className={`f-group d${Math.min(depth, 3)}`}>
      <legend><Label path={path} name={name} /></legend>
      <div className="f-grid">
        {s.propertyNames!.enum!.map((k) => (
          <Field key={String(k)} s={valueSchema} value={obj[String(k)]} onChange={(v) => onChange({ ...obj, [String(k)]: v })}
            path={join(path, String(k))} name={String(k)} required ctx={ctx} depth={depth + 1} />
        ))}
      </div>
      <ErrorText ctx={ctx} path={path} />
    </fieldset>
  );
}

function summaryOf(item: unknown): string {
  if (typeof item === "string") return item;
  if (Array.isArray(item)) return item.map(summaryOf).join(" ").trim();
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    for (const k of ["title", "name", "label", "grade", "question", "text", "value", "id"]) {
      if (typeof o[k] === "string" && o[k]) return o[k] as string;
    }
  }
  return "";
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

function ArrayField({ s, value, onChange, path, name, ctx, depth }: FieldProps) {
  const items = Array.isArray(value) ? value : [];
  const itemSchema = s.items ?? {};
  const itemInner = unwrap(itemSchema).inner;
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  // ?open=<list>.<n> (or .new) opens that item's pop-up right away, e.g. from the admin list of pages.
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("open")?.match(/^([\w.]+)\.(\d+|new)$/);
    if (!m || m[1] !== path) return;
    setOpenIdx(m[2] === "new" ? items.length : Math.min(Number(m[2]), items.length));
    // Only on arrival: later saves and closes leave the address as it was.
  }, []);

  if (itemInner.enum) return <EnumArray s={itemInner} items={items as string[]} onChange={onChange} path={path} name={name} ctx={ctx} ordered={path === "sections"} />;

  const complex = isComplex(itemSchema);
  const props = itemInner.properties ? Object.entries(itemInner.properties) : [];
  // Inline rows only for tiny items (one or two short fields, e.g. a link's label and address);
  // anything with a picture or a long text (an FAQ answer) gets a card and a pop-up.
  const compact = !complex || (kindOf(itemInner) === "object" && props.length <= 2 && props.every(([k, p]) => !isComplex(p) && p.widget !== "image" && !LONG_FIELDS.has(k)));

  const tools = (i: number) => (
    <span className="f-tools">
      <button type="button" aria-label="لأعلى" disabled={i === 0} onClick={() => onChange(move(items, i, i - 1))}>↑</button>
      <button type="button" aria-label="لأسفل" disabled={i === items.length - 1} onClick={() => onChange(move(items, i, i + 1))}>↓</button>
      <button type="button" aria-label="حذف" className="danger" onClick={() => {
        // Whole items (cards) ask first; small inline rows don't.
        if (!compact && !window.confirm(`تمسح «${summaryOf(items[i]) || "العنصر ده"}»؟`)) return;
        onChange(items.filter((_, j) => j !== i));
      }}>✕</button>
    </span>
  );

  return (
    <fieldset className={`f-group f-array d${Math.min(depth, 3)}`}>
      <legend><Label path={path} name={name} /> <span className="f-count">{items.length}</span></legend>
      <Hint path={path} />
      <ErrorText ctx={ctx} path={path} />
      <div className="f-items">
        {items.map((item, i) => {
          const itemPath = join(path, i);
          const set = (v: unknown) => onChange(items.map((x, j) => (j === i ? v : x)));
          if (compact) {
            return (
              <div key={i} className="f-item compact">
                <div className="f-item-body">
                  <Field s={itemSchema} value={item} onChange={set} path={itemPath} name={name} required ctx={ctx} depth={depth + 1} bare />
                </div>
                {tools(i)}
              </div>
            );
          }
          const hasError = Object.keys(ctx.errors).some((k) => k === itemPath || k.startsWith(`${itemPath}.`));
          return (
            <ItemCard key={i} n={i + 1} item={item} s={itemInner} ctx={ctx} hasError={hasError} tools={tools(i)} onOpen={() => setOpenIdx(i)} />
          );
        })}
      </div>
      {complex && !compact ? (
        <button type="button" className="f-add" onClick={() => setOpenIdx(items.length)}>+ إضافة</button>
      ) : (
        <button type="button" className="f-add" onClick={() => onChange([...items, defaultFor(itemSchema)])}>+ إضافة</button>
      )}
      {openIdx !== null && (
        <ItemDialog
          title={openIdx < items.length ? `تعديل: ${summaryOf(items[openIdx]) || labelFor(path, name)}` : `إضافة: ${labelFor(path, name)}`}
          initial={openIdx < items.length ? items[openIdx] : defaultFor(itemSchema)}
          s={itemSchema} path={join(path, openIdx)} name={name} ctx={ctx} depth={depth}
          onSave={(v) => { onChange(openIdx < items.length ? items.map((x, j) => (j === openIdx ? v : x)) : [...items, v]); setOpenIdx(null); }}
          onClose={() => setOpenIdx(null)}
        />
      )}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/* Lists of items: a preview card each; the form opens in a pop-up      */
/* ------------------------------------------------------------------ */

const SKIP_FACT = new Set(["id", "ref", "form", "message", "correct", "draft", "stage"]);
const MAX_FACT = 42;

/** Short lines that tell items apart on their card: dates, times, choices, counts... */
function factsOf(item: unknown, s: JS): string[] {
  if (!item || typeof item !== "object" || Array.isArray(item)) return [];
  const o = item as Record<string, unknown>;
  const title = summaryOf(item);
  const out: string[] = [];
  for (const [key, ps] of Object.entries(s.properties ?? {})) {
    if (out.length >= 3) break;
    // Ids, button wording and ready messages don't tell items apart.
    if (HIDDEN.has(key) || SKIP_FACT.has(key) || /(Label|Message)$/.test(key)) continue;
    const v = o[key];
    const inner = unwrap(ps).inner;
    const kind = kindOf(inner);
    if (v === undefined || v === null || v === "") continue;
    if (kind === "enum" && typeof v === "string") out.push(enumLabel(v, key));
    else if (kind === "string" && typeof v === "string" && inner.widget !== "image" && v !== title) {
      const t = v.trim();
      if (inner.widget === "date") out.push(t.replace("T", " "));
      else if (t.length <= MAX_FACT) out.push(key === "path" ? `/${t}` : t);
    } else if (kind === "array" && Array.isArray(v) && v.length) {
      const itemInner = unwrap(inner.items ?? {}).inner;
      if (itemInner.enum) out.push(v.map((x) => enumLabel(String(x), key)).join("، "));
      else if (kindOf(itemInner) === "object") out.push(`${labelFor("", key)}: ${v.length}`);
    }
  }
  return out;
}

/** The item's picture for its card: its own image, or the first in a list of images. */
function imageOf(item: unknown, s: JS): string | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  for (const [key, ps] of Object.entries(s.properties ?? {})) {
    const inner = unwrap(ps).inner;
    if (inner.widget === "image" && typeof o[key] === "string" && o[key]) return o[key] as string;
    if (kindOf(inner) === "array" && Array.isArray(o[key])) {
      const first = (o[key] as unknown[])[0] as Record<string, unknown> | undefined;
      if (first && typeof first.image === "string" && first.image) return first.image;
    }
  }
  return null;
}

const srcOf = (v: string, ctx: FormCtx) => (/^(https?:)?\//.test(v) ? v : `${ctx.assetBase}/${v.split("/").map(encodeURIComponent).join("/")}`);

function ItemCard({ n, item, s, ctx, hasError, tools, onOpen }: { n: number; item: unknown; s: JS; ctx: FormCtx; hasError: boolean; tools: React.ReactNode; onOpen: () => void }) {
  const img = imageOf(item, s);
  const facts = factsOf(item, s);
  return (
    <div className={`f-card${hasError ? " bad" : ""}`}>
      <button type="button" className="f-card-main" onClick={onOpen}>
        {img ? <img className="f-card-img" src={srcOf(img, ctx)} alt="" /> : <span className="f-item-n">{n}</span>}
        <span className="f-card-text">
          <b>{summaryOf(item) || "من غير عنوان"}</b>
          {facts.length > 0 && <small>{facts.join(" · ")}</small>}
          {hasError && <small className="f-card-err">فيه حاجة محتاجة تتصلح، افتحها</small>}
        </span>
        <span className="f-card-edit">تعديل</span>
      </button>
      {tools}
    </div>
  );
}

/** One item's form in a pop-up. Changes stay in the pop-up until «حفظ». */
function ItemDialog({ title, initial, s, path, name, ctx, depth, onSave, onClose }: {
  title: string; initial: unknown; s: JS; path: string; name: string; ctx: FormCtx; depth: number;
  onSave: (v: unknown) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const start = useRef(JSON.stringify(initial));
  const dirty = JSON.stringify(draft) !== start.current;
  // Closing plays the exit animation first, then hands over (save or close).
  const [closing, setClosing] = useState(false);
  const after = useRef<(() => void) | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const finish = (fn: () => void) => {
    if (after.current) return;
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { fn(); return; }
    after.current = fn;
    setClosing(true);
    // In case the animation never reports its end (hidden tab, old browser).
    window.setTimeout(done, 320);
  };
  function done() {
    const fn = after.current;
    if (!fn) return;
    after.current = () => {};
    fn();
  }
  const cancel = () => {
    if (dirty && !window.confirm("في تعديلات مش محفوظة في العنصر ده. تقفل من غير حفظ؟")) return;
    finish(onClose);
  };
  return (
    <dialog ref={ref} className={`f-dialog${closing ? " closing" : ""}`} aria-label={title}
      onAnimationEnd={(e) => { if (closing && e.target === e.currentTarget) done(); }}
      onCancel={(e) => { e.preventDefault(); cancel(); }}
      onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="f-dialog-box">
        <header className="f-dialog-head">
          <h2>{title}</h2>
          <button type="button" className="f-dialog-x" aria-label="إغلاق" onClick={cancel}>✕</button>
        </header>
        <div className="f-dialog-body">
          <Field s={s} value={draft} onChange={setDraft} path={path} name={name} required ctx={ctx} depth={depth + 1} bare />
        </div>
        <footer className="f-dialog-foot">
          <button type="button" className="btn-sm ghost" onClick={cancel}>إلغاء</button>
          <button type="button" className="btn-sm primary" onClick={() => finish(() => onSave(draft))}>حفظ</button>
        </footer>
      </div>
    </dialog>
  );
}

function EnumArray({ s, items, onChange, path, name, ctx, ordered }: { s: JS; items: string[]; onChange: (v: unknown) => void; path: string; name: string; ctx: FormCtx; ordered: boolean }) {
  const options = s.enum!.map(String);
  const label = ordered ? sectionEnumLabel : enumLabel;
  if (!ordered) {
    return (
      <fieldset className="f-group f-enum-set">
        <legend><Label path={path} name={name} /></legend>
        <div className="f-chips">
          {options.map((o) => (
            <label key={o} className="f-chip">
              <input type="checkbox" checked={items.includes(o)}
                onChange={(e) => onChange(e.target.checked ? options.filter((x) => x === o || items.includes(x)) : items.filter((x) => x !== o))} />
              {label(o)}
            </label>
          ))}
        </div>
        <ErrorText ctx={ctx} path={path} />
      </fieldset>
    );
  }
  const remaining = options.filter((o) => !items.includes(o));
  return (
    <fieldset className="f-group f-array">
      <legend><Label path={path} name={name} /></legend>
      <Hint path={path} />
      <ErrorText ctx={ctx} path={path} />
      <ol className="f-order">
        {items.map((o, i) => (
          <li key={o}>
            <span>{label(o)}</span>
            <span className="f-tools">
              <button type="button" aria-label="لأعلى" disabled={i === 0} onClick={() => onChange(move(items, i, i - 1))}>↑</button>
              <button type="button" aria-label="لأسفل" disabled={i === items.length - 1} onClick={() => onChange(move(items, i, i + 1))}>↓</button>
              <button type="button" aria-label="إخفاء" className="danger" onClick={() => onChange(items.filter((x) => x !== o))}>✕</button>
            </span>
          </li>
        ))}
      </ol>
      {remaining.length > 0 && (
        <select value="" onChange={(e) => e.target.value && onChange([...items, e.target.value])} aria-label="إظهار قسم">
          <option value="">+ إظهار قسم…</option>
          {remaining.map((o) => <option key={o} value={o}>{label(o)}</option>)}
        </select>
      )}
    </fieldset>
  );
}

/** Rich-text pieces (title/lede/headline segments) are short: one line each. */
const SEGMENT_TEXT = /(^|\.)(title|lede|headline)(\.\d+)+\.text$/;

function StringInput({ id, s, value, onChange, name, path, required, ctx }: { id: string; s: JS; value: string | undefined; onChange: (v: unknown) => void; name: string; path: string; required: boolean; ctx: FormCtx }) {
  const v = value ?? "";
  const set = (x: string) => onChange(x === "" && !required ? undefined : x);
  if (s.widget === "image") return <ImageInput value={value} onChange={onChange} required={required} ctx={ctx} cutoutable={path === "profile.photo"} />;
  if (s.pattern === TIME_PATTERN) return <input id={id} type="time" dir="ltr" value={v} onChange={(e) => set(e.target.value)} />;
  if (s.widget === "date") return <DateTimeInput id={id} value={v} onChange={set} />;
  if (s.widget === "form") {
    const forms = ctx.forms ?? [];
    return (
      <select id={id} value={v} onChange={(e) => set(e.target.value)}>
        <option value="">يفتح واتساب (الافتراضي)</option>
        {forms.map((f) => <option key={f.id} value={f.id}>يفتح نموذج: {f.title}</option>)}
        {v && !forms.some((f) => f.id === v) && <option value={v}>نموذج غير موجود: {v}</option>}
      </select>
    );
  }
  if (name === "date") {
    const dateOnly = !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
    return <input id={id} type={dateOnly ? "date" : "text"} dir="ltr" value={v} onChange={(e) => set(e.target.value)} />;
  }
  if (s.pattern?.startsWith("^#(")) {
    return (
      <span className="f-color">
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : "#000000"} onChange={(e) => set(e.target.value)} />
        <input id={id} type="text" dir="ltr" value={v} onChange={(e) => set(e.target.value)} />
      </span>
    );
  }
  if (LONG_TEXT.has(name) && !SEGMENT_TEXT.test(path)) return <textarea id={id} rows={Math.min(8, Math.max(2, Math.ceil(v.length / 60)))} value={v} onChange={(e) => set(e.target.value)} />;
  const ltr = LTR.has(name) || s.format === "uri";
  return <input id={id} type={s.format === "uri" ? "url" : "text"} dir={ltr ? "ltr" : undefined} value={v} onChange={(e) => set(e.target.value)} />;
}

/** A day, and optionally a time on that day ("2026-10-10" or "2026-10-10T18:00"). */
function DateTimeInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [day, time = ""] = value.split("T");
  return (
    <span className="f-datetime">
      <input id={id} type="date" dir="ltr" value={day ?? ""} onChange={(e) => onChange(e.target.value ? e.target.value + (time ? `T${time.slice(0, 5)}` : "") : "")} />
      <input type="time" dir="ltr" aria-label="الساعة (اختياري)" value={time.slice(0, 5)} disabled={!day}
        onChange={(e) => onChange(day + (e.target.value ? `T${e.target.value}` : ""))} />
    </span>
  );
}

/** cutoutable: the teacher's main photo, which can have its background removed (lib/cutout.ts). */
function ImageInput({ value, onChange, required, ctx, cutoutable }: { value: string | undefined; onChange: (v: unknown) => void; required: boolean; ctx: FormCtx; cutoutable?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [error, setError] = useState("");
  const src = value ? (/^(https?:)?\//.test(value) ? value : `${ctx.assetBase}/${value.split("/").map(encodeURIComponent).join("/")}`) : "";
  return (
    <span className="f-image">
      {src ? <img src={src} alt="" /> : <span className="f-image-empty">لا توجد صورة</span>}
      <span className="f-image-actions">
        <span className="btn-sm f-upload">
          {busy ? "جاري الرفع…" : value ? "تغيير الصورة" : "رفع صورة"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              const small = await shrinkForUpload(f);
              if (small.size > 4 * 1024 * 1024) { setBusy(false); setError("الصورة كبيرة جداً. جرّب صورة تانية."); return; }
              const r = await ctx.upload(small).catch(() => ({ ok: false as const, error: "تعذّر رفع الصورة." }));
              setBusy(false);
              if (r.ok) { setError(""); onChange(r.key); } else setError(r.error);
            }} />
        </span>
        {cutoutable && src && !/cutout/i.test(value ?? "") && (
          <button type="button" className="btn-sm" disabled={busy || cutting}
            onClick={async () => {
              setCutting(true); setError("");
              const made = await cutout(src).catch(() => null);
              const r = made ? await ctx.upload(made.file).catch(() => ({ ok: false as const, error: "تعذّر رفع الصورة." })) : null;
              setCutting(false);
              if (!r) setError("معرفناش نلاقي شخص واضح في الصورة. جرّب صورة ليك من الوسط لفوق.");
              else if (r.ok) onChange(r.key); else setError(r.error);
            }}>
            {cutting ? "بنشيل الخلفية…" : "شيل الخلفية"}
          </button>
        )}
        {value && !required && <button type="button" className="f-link danger" onClick={() => onChange(undefined)}>إزالة</button>}
      </span>
      {error && <span className="f-err" role="alert">{error}</span>}
    </span>
  );
}

function JsonInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <>
      <textarea dir="ltr" rows={5} className="f-json" value={text}
        onChange={(e) => {
          setText(e.target.value);
          try { onChange(JSON.parse(e.target.value)); setBad(false); } catch { setBad(true); }
        }} />
      {bad && <span className="f-err">صيغة JSON غير صحيحة.</span>}
    </>
  );
}
