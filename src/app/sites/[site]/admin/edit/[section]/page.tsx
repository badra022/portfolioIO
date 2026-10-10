import { notFound } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { sectionById } from "@/lib/admin/sections";
import { pickSchema, type JS } from "@/lib/admin/schema-tools";
import { contentJsonSchema, themeJsonSchema } from "@/lib/content-utils";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { getTenant } from "@/lib/server/repo";
import { assetBase } from "@/lib/server/assets";
import { SectionEditor } from "@/components/admin/SectionEditor";
import { PREVIEW_PATH } from "@/lib/environments";
import { sameJson } from "@/lib/content-utils";

export default async function EditSection({ params }: PageProps<"/sites/[site]/admin/edit/[section]">) {
  const { site: raw, section } = await params;
  const site = decodeURIComponent(raw);
  const p = await requireAdmin(site);
  const def = sectionById(section);
  const slug = await slugForSite(site);
  if (!def || !slug || site === "_platform") notFound();
  if (def.superOnly && p.kind !== "super") notFound();
  const t = await getTenant(slug);
  if (!t) notFound();

  const schema: JS = def.theme ? (themeJsonSchema as JS) : pickSchema(contentJsonSchema as JS, def.keys ?? []);
  // The editor works on the preview copy (same as the public site until something is saved to preview).
  const pick = (copy: { content: unknown; theme: unknown }) => {
    const source = (def.theme ? copy.theme : copy.content) as Record<string, unknown>;
    return def.theme
      ? structuredClone(source)
      : Object.fromEntries((def.keys ?? []).filter((k) => source[k] !== undefined).map((k) => [k, structuredClone(source[k])]));
  };
  const initial = pick(t.preview);
  const pending = t.preview.pending && !sameJson(initial, pick(t));
  const base = baseForSite(site);

  return (
    <>
      <div className="a-head">
        <a className="a-back" href={`${base}/admin`}>→ كل الأقسام</a>
        <h1>{def.title}</h1>
        <p className="a-sub">{def.description}</p>
      </div>
      <SectionEditor
        site={site}
        sectionId={def.id}
        schema={schema}
        initial={initial}
        version={t.version}
        previewVersion={t.preview.version}
        pending={pending}
        previewUrl={`${base}${PREVIEW_PATH}/`}
        assetBase={assetBase(slug)}
        viewUrl={`${base}/`}
        forms={t.content.forms.map((f) => ({ id: f.id, title: f.title }))}
      />
    </>
  );
}
