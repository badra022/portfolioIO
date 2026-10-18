// Vercel's build command (vercel.json). Applies pending database migrations, then builds.
//
// Migrations run only for the two long-lived environments:
//   - production (VERCEL_ENV=production, the main branch) -> production database
//   - the develop branch                                   -> dev database
// Feature-branch previews skip them, so unmerged migrations never touch the shared
// dev database. A failing migration fails the build, and Vercel keeps serving the
// previous deployment. Migrations must therefore stay backward compatible (add, don't
// rename or drop in the same release as the code that stops using something).
import { spawnSync } from "node:child_process";

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const target = process.env.VERCEL_ENV;
const branch = process.env.VERCEL_GIT_COMMIT_REF;
const migrate = target === "production" || branch === "develop";

if (migrate && (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)) {
  console.log(`Applying migrations (${target}, ${branch})...`);
  run("node", ["scripts/db-migrate.mjs"]);
} else {
  console.log(`Skipping migrations (${target ?? "local"}, ${branch ?? "no branch"}).`);
}

// The photo background remover's runtime (normally copied on install).
run("node", ["scripts/copy-segmenter.mjs"]);
run("npx", ["next", "build"]);
