"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSectionAction } from "@/app/sites/[site]/admin/actions";
import { Icon } from "@/components/Icon";

export type StructureSection = { key: string; label: string; icon: string; ready: boolean };
type Status = { kind: "idle" | "saving" | "saved" | "error"; text?: string };

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The page's skeleton on the admin home: the sections students see, top to bottom.
 * The teacher adds, removes and reorders them, then saves to the preview or
 * publishes. What each section says is edited from the menu, not here.
 */
export function PageStructure(props: {
  site: string;
  /** The working copy (the preview's order) and the public site's order. */
  initial: string[];
  live: string[];
  sections: StructureSection[];
  version: number;
  previewVersion: number;
  previewUrl: string;
}) {
  const router = useRouter();
  const byKey = new Map(props.sections.map((s) => [s.key, s]));
  const [order, setOrder] = useState(props.initial.filter((k) => byKey.has(k)));
  const [saved, setSaved] = useState(order);
  const [live, setLive] = useState(props.live);
  const [versions, setVersions] = useState({ production: props.version, preview: props.previewVersion });
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const dirty = !same(order, saved);
  const unpublished = !same(saved, live);
  const busy = status.kind === "saving";
  const hidden = props.sections.filter((s) => !order.includes(s.key));

  const change = (next: string[]) => { setOrder(next); setStatus({ kind: "idle" }); };

  async function save(target: "preview" | "production") {
    if (!order.length) { setStatus({ kind: "error", text: "لازم يفضل قسم واحد على الأقل في الصفحة." }); return; }
    setStatus({ kind: "saving" });
    const r = await saveSectionAction(props.site, "structure", { sections: order }, versions, target)
      .catch(() => ({ ok: false as const, reason: "error" as const, message: "انقطع الاتصال. حاول مرة أخرى." }));
    if (r.ok) {
      setVersions({ production: r.version, preview: r.previewVersion });
      setSaved(order);
      if (target === "production") setLive(order);
      setStatus({ kind: "saved", text: target === "production" ? "اتنشر. الطلاب شايفين الترتيب الجديد." : "اتحفظ في المعاينة. راجعه وانشره لما تكون جاهز." });
      router.refresh();
      return;
    }
    const text = r.reason === "invalid" ? r.issues.map((i) => i.message).join(" ")
      : r.reason === "conflict" ? "حد تاني حفظ تعديلات بعد ما فتحت الصفحة. أعد تحميل الصفحة."
      : r.reason === "forbidden" ? "غير مصرح لك بهذا التعديل."
      : ("message" in r && r.message) || "حدث خطأ أثناء الحفظ.";
    setStatus({ kind: "error", text });
  }

  const state = busy ? "saving" : status.kind === "error" ? "error" : dirty ? "dirty" : unpublished ? "draft" : "clean";
  const stateText = busy ? "جاري الحفظ…" : status.text ?? (dirty ? "عندك تغييرات مش محفوظة" : unpublished ? "محفوظ في المعاينة، لسه مش منشور" : "ده الترتيب اللي الطلاب شايفينه");

  return (
    <section className="ps" aria-labelledby="ps-h">
      <div className="hm-h-row">
        <h2 id="ps-h" className="hm-h">ترتيب صفحتك</h2>
        <a className="f-link" href={props.previewUrl} target="_blank" rel="noopener">شوف المعاينة ↗</a>
      </div>
      <p className="a-sub ps-sub">ده هيكل صفحتك زي ما الطلاب هيشوفوها من فوق لتحت. ضيف قسم، شيله، أو حرّكه، وبعدين احفظ. محتوى كل قسم بتعدّله من القائمة.</p>

      <div className="ps-grid">
        <div className="ps-page" aria-label="أقسام الصفحة بالترتيب">
          <div className="ps-bar" aria-hidden="true"><i /><i /><i /></div>
          {order.length === 0 && <p className="an-empty">الصفحة فاضية. ضيف قسم من الناحية التانية.</p>}
          <ol className="ps-list">
            {order.map((key, i) => {
              const s = byKey.get(key)!;
              const isNew = !live.includes(key);
              const moved = !isNew && live.indexOf(key) !== i;
              return (
                <li key={key} className={`ps-block${i === 0 ? " first" : ""}`}>
                  <span className="ps-n">{i + 1}</span>
                  <span className="hm-ico"><Icon name={s.icon} /></span>
                  <span className="ps-name">
                    <b>{s.label}</b>
                    {(isNew || moved) && <small className="st-chip draft">{isNew ? "جديد، مش منشور" : "مكانه اتغيّر"}</small>}
                  </span>
                  <span className="ps-tools">
                    <button type="button" aria-label={`${s.label}: لفوق`} disabled={i === 0 || busy} onClick={() => change(move(order, i, i - 1))}>↑</button>
                    <button type="button" aria-label={`${s.label}: لتحت`} disabled={i === order.length - 1 || busy} onClick={() => change(move(order, i, i + 1))}>↓</button>
                    <button type="button" className="danger" aria-label={`شيل ${s.label} من الصفحة`} disabled={busy} onClick={() => change(order.filter((k) => k !== key))}>✕</button>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="ps-side">
          <h3>ضيف قسم للصفحة</h3>
          {hidden.length === 0 ? <p className="an-empty">كل الأقسام ظاهرة في صفحتك.</p> : (
            <ul className="ps-add">
              {hidden.map((s) => (
                <li key={s.key}>
                  {s.ready ? (
                    <button type="button" disabled={busy} onClick={() => change([...order, s.key])}>
                      <span className="hm-ico"><Icon name={s.icon} /></span><span>{s.label}</span><b aria-hidden="true">+</b>
                    </button>
                  ) : (
                    <span className="ps-not-ready">
                      <span className="hm-ico"><Icon name={s.icon} /></span>
                      <span>{s.label}<small>جهّز محتواه الأول من القائمة</small></span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="ps-save">
        <span className={`a-status ${state}`} aria-live="polite"><i className="a-dot" aria-hidden="true" />{stateText}</span>
        {dirty && <button type="button" className="btn-sm ghost" disabled={busy} onClick={() => change(saved)}>تراجع</button>}
        <button type="button" className="btn-sm ghost" disabled={busy || !dirty} onClick={() => void save("preview")}>احفظ ومتنشرش</button>
        <button type="button" className="btn-sm primary" disabled={busy || (!dirty && !unpublished)} onClick={() => void save("production")}>احفظ وانشر</button>
      </div>
    </section>
  );
}
