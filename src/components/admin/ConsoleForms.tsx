"use client";

import { useActionState } from "react";
import type { ConsoleState } from "@/app/sites/[site]/admin/actions";

type Action = (prev: ConsoleState, form: FormData) => Promise<ConsoleState>;

function Result({ state }: { state: ConsoleState }) {
  if (!state) return null;
  return (
    <div className={`a-result ${state.ok ? "ok" : "bad"}`} role="status">
      <p>{state.message}</p>
      {state.lines && <ul>{state.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
      {state.secret && (
        <dl className="a-secret">
          <dt>اسم المستخدم</dt><dd dir="ltr"><code>{state.secret.username}</code></dd>
          <dt>كلمة المرور</dt><dd dir="ltr"><code>{state.secret.password}</code></dd>
        </dl>
      )}
    </div>
  );
}

/** A small form bound to a console server action, showing its result inline. */
export function ActionForm({ action, children, submit, className }: { action: Action; children?: React.ReactNode; submit: string; className?: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "a-form"}>
      {children}
      <button type="submit" className="btn-sm primary" disabled={pending}>{pending ? "جاري التنفيذ…" : submit}</button>
      <Result state={state} />
    </form>
  );
}
