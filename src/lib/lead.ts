/**
 * A button that opens a form instead of a chat carries what it's about in a
 * data attribute; components/LeadForms.tsx picks up the click anywhere on the page.
 */
export type LeadTrigger = {
  /** Form id (content.forms). */
  f: string;
  /** What the teacher sees as the button, e.g. "احجز (SCH-12)". */
  s: string;
  /** Details the button carries: the chosen answer, group, exam... (label -> value). */
  c?: Record<string, string>;
  /** Shown instead of the form while something must be picked first (e.g. an answer). */
  n?: string;
};

export const leadAttr = (t: LeadTrigger) => ({ "data-lead": JSON.stringify(t) });

export const sourceLabel = (label: string, ref?: string) => (ref ? `${label} (${ref})` : label);
