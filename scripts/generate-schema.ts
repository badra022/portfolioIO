// Writes JSON Schemas for editor autocomplete in tenants/*/*.json.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ContentSchema, DeploySchema, ThemeSchema } from "../src/lib/schema.ts";

const out = path.resolve(import.meta.dirname, "..", "schema");
fs.mkdirSync(out, { recursive: true });
for (const [name, s] of [["content", ContentSchema], ["theme", ThemeSchema], ["deploy", DeploySchema]] as const) {
  const json = z.toJSONSchema(s, { io: "input", unrepresentable: "any" });
  fs.writeFileSync(path.join(out, `${name}.schema.json`), JSON.stringify(json, null, 2) + "\n");
  console.log(`schema/${name}.schema.json`);
}
