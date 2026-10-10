"use client";

import { useActionState, useMemo, useState } from "react";
import type { ConsoleState } from "@/app/sites/[site]/admin/actions";
import { deleteResultSetAction, importResultsAction, saveResultRowsAction, updateResultMetaAction } from "@/app/sites/[site]/admin/actions";
import type { ResultSet } from "@/lib/server/exam-results";
import {
  findResult, guessColumns, isPhoneKey, nameKey, parseText, percentOf, phoneKey, rowKey, rowsFromTable,
  type Columns, type ResultRow,
} from "@/lib/exam-results";
import { readXlsx, XlsxError, type Sheet } from "@/lib/xlsx";

/* ------------------------------------------------------------------ */
/* New exam results                                                    */
/* ------------------------------------------------------------------ */

type ExamOption = { id: string; title: string; date: string };

export function NewResultSet({ action, exams }: { action: (prev: ConsoleState, form: FormData) => Promise<ConsoleState>; exams: ExamOption[] }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [examId, setExamId] = useState(exams[0]?.id ?? "");
  const picked = exams.find((e) => e.id === examId);
  const [title, setTitle] = useState(picked?.title ?? "");
  const [date, setDate] = useState(picked?.date ?? "");
  return (
    <form action={formAction} className="a-form" style={{ marginTop: 12 }}>
      {exams.length > 0 && (
        <label className="f-field">
          <span className="f-label">الامتحان</span>
          <select name="examId" value={examId} onChange={(e) => {
            setExamId(e.target.value);
            const x = exams.find((y) => y.id === e.target.value);
            if (x) { setTitle(x.title); setDate(x.date); }
          }}>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.title} — {e.date}</option>)}
            <option value="">امتحان تاني (اكتب اسمه وتاريخه)</option>
          </select>
        </label>
      )}
      <label className="f-field">
        <span className="f-label">اسم الامتحان (اللي الطالب هيشوفه)</span>
        <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: امتحان الشهر – تالتة ثانوي" required />
      </label>
      <div className="rs-grid">
        <label className="f-field">
          <span className="f-label">التاريخ</span>
          <input type="date" name="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="f-field">
          <span className="f-label">الدرجة النهائية <em className="f-opt">(اختياري)</em></span>
          <input name="total" inputMode="decimal" placeholder="مثلاً 50" />
        </label>
      </div>
      <button type="submit" className="btn-sm primary" disabled={pending}>{pending ? "جاري الإنشاء…" : "إنشاء وفتح"}</button>
      {state && !state.ok && <div className="a-result bad" role="status"><p>{state.message}</p></div>}
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* One exam's results                                                  */
/* ------------------------------------------------------------------ */

type Status = { tone: "" | "saved" | "error"; text: string };
const EMPTY: ResultRow = { name: "", phone: "", score: "" };

export function ResultsEditor({ site, initial }: { site: string; initial: ResultSet }) {
  const [set, setSet] = useState(initial);
  const [rows, setRows] = useState<ResultRow[]>(initial.rows);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<Status>({ tone: "", text: "" });
  const [busy, setBusy] = useState(false);

  const loaded = (s: ResultSet) => { setSet(s); setRows(s.rows); setDirty(false); };
  const edit = (next: ResultRow[]) => { setRows(next); setDirty(true); setStatus({ tone: "", text: "" }); };

  const save = async () => {
    setBusy(true);
    const r = await saveResultRowsAction(site, set.id, rows, set.version).catch(() => ({ ok: false as const, message: "مفيش اتصال؟ حاول تاني." }));
    setBusy(false);
    if (!r.ok) { setStatus({ tone: "error", text: r.message }); return; }
    loaded(r.set);
    setStatus({ tone: "saved", text: `اتحفظ (${r.set.rows.length} طالب).` });
  };

  return (
    <>
      <Meta site={site} set={set} onSaved={(m) => setSet({ ...set, ...m })} />
      <Import site={site} set={set} blocked={dirty} onImported={(s, text) => { loaded(s); setStatus({ tone: "saved", text }); }} />
      <Rows rows={rows} total={set.total} onChange={edit} />
      <TryIt rows={rows} total={set.total} />
      <details className="a-panel a-confirm">
        <summary className="btn-sm danger">مسح نتايج الامتحان ده</summary>
        <form action={deleteResultSetAction.bind(null, site, set.id)}>
          <p className="a-sub">هتتمسح كل الدرجات ({set.rows.length} طالب) وتختفي من الموقع. مفيش رجوع.</p>
          <button type="submit" className="btn-sm danger">أيوه، امسح</button>
        </form>
      </details>
      {(dirty || status.text) && (
        <div className="a-savebar">
          <span className={`a-status ${status.tone}`} role="status">{status.text || "فيه تعديلات مش محفوظة."}</span>
          {dirty && <button type="button" className="btn-sm ghost" onClick={() => { setRows(set.rows); setDirty(false); }}>تراجع</button>}
          {dirty && <button type="button" className="btn-sm primary" disabled={busy} onClick={save}>{busy ? "جاري الحفظ…" : "حفظ التعديلات"}</button>}
        </div>
      )}
    </>
  );
}

/* ---------- title, date, full mark, published ---------- */

function Meta({ site, set, onSaved }: { site: string; set: ResultSet; onSaved: (m: Partial<ResultSet>) => void }) {
  const [title, setTitle] = useState(set.title);
  const [date, setDate] = useState(set.date);
  const [total, setTotal] = useState(set.total ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (published: boolean) => {
    setBusy(true);
    const r = await updateResultMetaAction(site, set.id, { title, date, total, published }).catch(() => ({ ok: false as const, message: "مفيش اتصال؟ حاول تاني." }));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.message }); return; }
    onSaved({ title: title.trim(), date, total: total.trim() || null, published });
    setMsg({ ok: true, text: published !== set.published ? (published ? "اتنشرت: الطلاب يقدروا يشوفوا نتايجهم دلوقتي من قسم الامتحانات." : "اتشالت من الموقع.") : "اتحفظ." });
  };

  return (
    <section className="a-panel">
      <div className="qz-head">
        <h2>بيانات الامتحان</h2>
        <span className={`rq-badge ${set.published ? "new" : ""}`}>{set.published ? "منشورة على الموقع" : "مش منشورة"}</span>
      </div>
      <div className="a-form">
        <label className="f-field">
          <span className="f-label">اسم الامتحان</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="rs-grid">
          <label className="f-field">
            <span className="f-label">التاريخ</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="f-field">
            <span className="f-label">الدرجة النهائية <em className="f-opt">(اختياري)</em></span>
            <input value={total} inputMode="decimal" onChange={(e) => setTotal(e.target.value)} placeholder="مثلاً 50" />
          </label>
        </div>
        <div className="qz-actions">
          <button type="button" className="btn-sm ghost" disabled={busy} onClick={() => save(set.published)}>حفظ البيانات</button>
          {set.published
            ? <button type="button" className="btn-sm ghost" disabled={busy} onClick={() => save(false)}>إخفاء من الموقع</button>
            : <button type="button" className="btn-sm primary" disabled={busy || !set.rows.length} onClick={() => save(true)}>نشر على الموقع</button>}
        </div>
        {!set.published && !set.rows.length && <p className="f-hint">ضيف الدرجات الأول، وبعدين انشر.</p>}
        {msg && <div className={`a-result ${msg.ok ? "ok" : "bad"}`} role="status"><p>{msg.text}</p></div>}
      </div>
    </section>
  );
}

/* ---------- import from Excel / CSV / pasted cells ---------- */

const ROLE: { key: keyof Omit<Columns, "header">; label: string; need?: boolean }[] = [
  { key: "name", label: "الاسم", need: true },
  { key: "phone", label: "رقم الموبايل", need: true },
  { key: "score", label: "الدرجة", need: true },
  { key: "note", label: "ملاحظة (اختياري)" },
];

function Import({ site, set, blocked, onImported }: { site: string; set: ResultSet; blocked: boolean; onImported: (s: ResultSet, message: string) => void }) {
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [sheetAt, setSheetAt] = useState(0);
  const [cols, setCols] = useState<Columns | null>(null);
  const [paste, setPaste] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const table = sheets?.[sheetAt]?.rows ?? null;
  const read = useMemo(() => (table && cols ? rowsFromTable(table, cols) : null), [table, cols]);

  const useSheets = (s: Sheet[]) => {
    const at = Math.max(0, s.findIndex((x) => x.rows.length > 0));
    setSheets(s);
    setSheetAt(at);
    setCols(guessColumns(s[at]?.rows ?? []));
    setError("");
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      if (/\.xlsx$/i.test(file.name)) useSheets(await readXlsx(await file.arrayBuffer()));
      else if (/\.xls$/i.test(file.name)) setError("ملفات .xls القديمة مش مدعومة: افتح الملف واحفظه بصيغة .xlsx، أو انسخ الخلايا والصقها في \"لصق من Excel\".");
      else useSheets([{ name: file.name, rows: parseText(await file.text()) }]);
    } catch (e) {
      setError(e instanceof XlsxError ? e.message : "مقدرناش نقرا الملف. جرّب تنسخ الخلايا من Excel وتلصقها.");
    }
  };

  const run = async () => {
    if (!read?.rows.length) return;
    setBusy(true);
    const r = await importResultsAction(site, set.id, read.rows, mode).catch(() => ({ ok: false as const, message: "مفيش اتصال؟ حاول تاني." }));
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    const s = r.summary;
    const parts = [`${s.added} جديد`, `${s.updated} اتحدّثت درجته`];
    if (s.unchanged) parts.push(`${s.unchanged} زي ما هو`);
    if (s.duplicates) parts.push(`${s.duplicates} مكرر في الملف`);
    onImported(r.set, `اتضاف: ${parts.join("، ")}. الإجمالي ${r.set.rows.length} طالب.`);
    setSheets(null); setCols(null); setPaste("");
  };

  const colName = (i: number) => {
    const head = cols?.header ? table?.[0]?.[i] : "";
    const sample = table?.[cols?.header ? 1 : 0]?.[i];
    return `عمود ${i + 1}${head ? `: ${head}` : sample ? ` (مثلاً ${sample})` : ""}`;
  };
  const width = Math.max(0, ...(table ?? []).map((r) => r.length));
  const missing = cols ? ROLE.filter((r) => r.need && cols[r.key] < 0) : [];

  return (
    <section className="a-panel">
      <h2>إضافة درجات من Excel</h2>
      <p className="a-sub">
        الشيت فيه عمود للاسم وعمود لرقم الموبايل وعمود للدرجة (وممكن عمود ملاحظة). الأعمدة بتتعرف لوحدها، وتقدر تغيّرها.
        الطالب اللي موجود بالفعل (نفس الرقم من غير كود الدولة ونفس الاسم الأول) درجته بتتحدّث بدل ما يتكرر.
      </p>
      {blocked && <p className="a-result bad">احفظ تعديلاتك على الجدول الأول، وبعدين ضيف من Excel.</p>}

      <div className="an-ranges" role="tablist">
        <a href="#" role="tab" aria-selected={tab === "file"} aria-current={tab === "file" ? "page" : undefined} onClick={(e) => { e.preventDefault(); setTab("file"); }}>ملف Excel أو CSV</a>
        <a href="#" role="tab" aria-selected={tab === "paste"} aria-current={tab === "paste" ? "page" : undefined} onClick={(e) => { e.preventDefault(); setTab("paste"); }}>لصق من Excel</a>
      </div>

      <div className="a-form" style={{ marginTop: 12 }}>
        {tab === "file" ? (
          <label className="btn-sm ghost f-upload">
            اختار ملف (.xlsx أو .csv)
            <input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        ) : (
          <>
            <label className="f-field">
              <span className="f-label">علّم الخلايا في Excel (مع العناوين) وانسخها والصقها هنا</span>
              <textarea rows={6} dir="auto" value={paste} onChange={(e) => setPaste(e.target.value)}
                placeholder={"الاسم\tالموبايل\tالدرجة\nأحمد محمد\t01012345678\t45\nمنى علي\t01198765432\t38"} />
              <span className="f-hint">أو اكتب كل طالب في سطر: الاسم، الرقم، الدرجة (مفصولين بفاصلة).</span>
            </label>
            <button type="button" className="btn-sm ghost" disabled={!paste.trim()} onClick={() => useSheets([{ name: "لصق", rows: parseText(paste) }])}>اقرا البيانات</button>
          </>
        )}
        {error && <div className="a-result bad" role="alert"><p>{error}</p></div>}

        {table && cols && (
          <>
            {sheets && sheets.length > 1 && (
              <label className="f-field">
                <span className="f-label">الشيت</span>
                <select value={sheetAt} onChange={(e) => { const i = Number(e.target.value); setSheetAt(i); setCols(guessColumns(sheets[i].rows)); }}>
                  {sheets.map((s, i) => <option key={i} value={i}>{s.name} ({s.rows.length} سطر)</option>)}
                </select>
              </label>
            )}
            <div className="rs-grid">
              {ROLE.map((r) => (
                <label className="f-field" key={r.key}>
                  <span className="f-label">{r.label}</span>
                  <select value={cols[r.key]} onChange={(e) => setCols({ ...cols, [r.key]: Number(e.target.value) })}>
                    <option value={-1}>{r.need ? "— اختار —" : "مفيش"}</option>
                    {[...Array(width).keys()].map((i) => <option key={i} value={i}>{colName(i)}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <label className="f-check">
              <input type="checkbox" checked={cols.header} onChange={(e) => setCols({ ...cols, header: e.target.checked })} />
              أول سطر عناوين (مش طالب)
            </label>

            {missing.length > 0 ? <p className="f-err">اختار عمود {missing.map((m) => m.label).join(" و")}.</p> : read && (
              <>
                <p className="a-sub">{read.rows.length} طالب في الملف. أول {Math.min(5, read.rows.length)}:</p>
                <table className="a-table rs-table">
                  <thead><tr><th>الاسم</th><th>الموبايل</th><th>الدرجة</th>{cols.note >= 0 && <th>ملاحظة</th>}</tr></thead>
                  <tbody>
                    {read.rows.slice(0, 5).map((r, i) => (
                      <tr key={i}><td>{r.name}</td><td dir="ltr">{r.phone}</td><td>{r.score}</td>{cols.note >= 0 && <td>{r.note}</td>}</tr>
                    ))}
                  </tbody>
                </table>
                {read.problems.length > 0 && (
                  <details className="a-result bad">
                    <summary>{read.problems.length} ملاحظة على الملف (هيتضافوا برضه، راجعهم)</summary>
                    <ul>{read.problems.slice(0, 50).map((p, i) => <li key={i}>{p}</li>)}</ul>
                  </details>
                )}
                <fieldset className="rs-mode">
                  <label className="f-check"><input type="radio" name="mode" checked={mode === "merge"} onChange={() => setMode("merge")} />ضيف على الموجود وحدّث درجات الطلاب المتكررين</label>
                  <label className="f-check"><input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} />امسح الموجود ({set.rows.length} طالب) وحط الملف ده بداله</label>
                </fieldset>
                <div className="qz-actions">
                  <button type="button" className="btn-sm primary" disabled={busy || blocked || !read.rows.length} onClick={run}>
                    {busy ? "جاري الإضافة…" : `إضافة ${read.rows.length} طالب`}
                  </button>
                  <button type="button" className="btn-sm ghost" onClick={() => { setSheets(null); setCols(null); }}>إلغاء</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ---------- the table ---------- */

function Rows({ rows, total, onChange }: { rows: ResultRow[]; total: string | null; onChange: (rows: ResultRow[]) => void }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) seen.set(rowKey(r), (seen.get(rowKey(r)) ?? 0) + 1);
    return seen;
  }, [rows]);
  const nq = nameKey(q), pq = phoneKey(q);
  const shown = rows.map((r, i) => ({ r, i })).filter(({ r }) => !q.trim() || (nq && nameKey(r.name).includes(nq)) || (pq.length >= 3 && phoneKey(r.phone).includes(pq)));
  const set = (i: number, patch: Partial<ResultRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <section className="a-panel">
      <div className="qz-head">
        <h2>الدرجات ({rows.length})</h2>
        <button type="button" className="btn-sm ghost" onClick={() => { onChange([...rows, { ...EMPTY }]); setEditing(rows.length); setQ(""); }}>+ طالب</button>
      </div>
      {rows.length > 8 && <input type="search" className="rs-search" placeholder="دوّر باسم أو رقم" value={q} onChange={(e) => setQ(e.target.value)} />}
      {rows.length === 0 ? <p className="an-empty">لسه مفيش درجات. ضيفها من Excel فوق، أو بـ "+ طالب".</p> : (
        <table className="a-table rs-table">
          <thead><tr><th>#</th><th>الاسم</th><th>الموبايل</th><th>الدرجة{total ? ` / ${total}` : ""}</th><th>ملاحظة</th><th /></tr></thead>
          <tbody>
            {shown.map(({ r, i }) => {
              const badPhone = !isPhoneKey(phoneKey(r.phone));
              const dup = (dupes.get(rowKey(r)) ?? 0) > 1;
              return editing === i ? (
                <tr key={i} className="rs-editing">
                  <td>{i + 1}</td>
                  <td><input value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="الاسم" autoFocus /></td>
                  <td><input value={r.phone} dir="ltr" inputMode="tel" onChange={(e) => set(i, { phone: e.target.value })} placeholder="01xxxxxxxxx" /></td>
                  <td><input value={r.score} onChange={(e) => set(i, { score: e.target.value })} placeholder="الدرجة" /></td>
                  <td><input value={r.note ?? ""} onChange={(e) => set(i, { note: e.target.value || undefined })} placeholder="ملاحظة" /></td>
                  <td><button type="button" className="btn-sm primary" onClick={() => setEditing(null)}>تم</button></td>
                </tr>
              ) : (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{r.name || <em className="f-err">من غير اسم</em>}{dup && <span className="rs-warn" title="نفس الرقم والاسم الأول متكرر"> مكرر</span>}</td>
                  <td dir="ltr">{r.phone}{badPhone && <span className="rs-warn" title="الطالب مش هيقدر يلاقي نتيجته من غير رقم صحيح"> ⚠</span>}</td>
                  <td><b>{r.score}</b>{percentOf(r.score, total) !== null && <small className="a-sub"> ({percentOf(r.score, total)}%)</small>}</td>
                  <td>{r.note}</td>
                  <td className="a-row-actions">
                    <button type="button" className="f-link" onClick={() => setEditing(i)}>تعديل</button>
                    <button type="button" className="f-link danger" onClick={() => { onChange(rows.filter((_, j) => j !== i)); setEditing(null); }}>حذف</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ---------- check what a student would see ---------- */

function TryIt({ rows, total }: { rows: ResultRow[]; total: string | null }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const hit = name.trim() && phone.trim() ? findResult(rows, name, phone) : undefined;
  return (
    <section className="a-panel">
      <h2>جرّب زي الطالب</h2>
      <p className="a-sub">اكتب اسم ورقم زي ما الطالب هيكتبهم، وشوف هيلاقي نتيجته ولا لأ (من الجدول اللي قدامك).</p>
      <div className="rs-grid">
        <input placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="رقم الموبايل" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      {hit !== undefined && (
        <div className={`a-result ${hit ? "ok" : "bad"}`} role="status">
          <p>{hit ? `هيلاقي: ${hit.name} — ${hit.score}${total ? ` / ${total}` : ""}${hit.note ? ` (${hit.note})` : ""}` : "مش هيلاقي نتيجة: لازم الرقم (من غير كود الدولة) والاسم الأول يطابقوا الجدول."}</p>
        </div>
      )}
    </section>
  );
}
