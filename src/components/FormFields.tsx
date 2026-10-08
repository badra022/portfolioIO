"use client";
import type { LeadFormT } from "@/lib/schema";

type Field = LeadFormT["fields"][number];

const TYPE: Record<string, React.InputHTMLAttributes<HTMLInputElement>> = {
  tel: { type: "tel", inputMode: "tel", dir: "ltr", autoComplete: "tel" },
  number: { type: "text", inputMode: "decimal", dir: "ltr" },
  text: { type: "text" },
};

/** Same checks as the server (lib/server/submissions.ts checkAnswers), so mistakes show instantly. */
export function checkFields(fields: Field[], values: Record<string, string>): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const f of fields) {
    const v = (values[f.id] ?? "").trim();
    if (!v) { if (f.required) problems[f.id] = "مطلوب"; continue; }
    if (f.type === "tel" && !/^\+?\d{8,15}$/.test(v.replace(/[\s\-().]/g, "").replace(/^00/, "+"))) problems[f.id] = "اكتب رقم صحيح";
    if (f.type === "number" && !/^-?\d+([.,]\d+)?$/.test(v)) problems[f.id] = "اكتب رقم";
  }
  return problems;
}

/** The questions of a form (lib/schema.ts LeadForm), used by form buttons and quiz pages. */
export function FormFields({ fields, values, errors, onChange, idPrefix = "lead", autoFocus }: {
  fields: Field[];
  values: Record<string, string>;
  errors: Record<string, string>;
  onChange: (id: string, value: string) => void;
  idPrefix?: string;
  autoFocus?: boolean;
}) {
  return (
    <>
      {fields.map((f, i) => {
        const id = `${idPrefix}-${f.id}`;
        const common = {
          id, name: f.id, value: values[f.id] ?? "", required: f.required, placeholder: f.placeholder,
          autoFocus: autoFocus && i === 0,
          "aria-invalid": errors[f.id] ? true : undefined,
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(f.id, e.target.value),
        };
        return (
          <label className="lead-field" key={f.id} htmlFor={id}>
            <span>{f.label}{!f.required && <em> (اختياري)</em>}</span>
            {f.type === "select" ? (
              <select {...common}>
                <option value="" disabled>اختر…</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === "textarea" ? (
              <textarea rows={3} {...common} />
            ) : (
              <input {...TYPE[f.type] ?? TYPE.text} autoComplete={f.id === "name" ? "name" : TYPE[f.type]?.autoComplete} {...common} />
            )}
            {errors[f.id] && <small className="lead-err" role="alert">{errors[f.id]}</small>}
          </label>
        );
      })}
    </>
  );
}
