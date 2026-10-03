# portfolioIO

Marketing sites for teachers. One site template, one folder per teacher. Every button on a teacher's page opens WhatsApp with a message already written for that offer (a group, the book, an exam), so the student only has to press send.

No backend, no login, no payments. Each teacher's site is a static export.

## How it is organised

```
tenants/
  mohamed-ali/            one folder per teacher (the folder name is the tenant id)
    content.json          everything the page says: profile, schedule, book, exams, messages
    theme.json            the visual identity: colors, fonts, radii, small style switches
    deploy.json           where this teacher is published
    assets/               this teacher's images and files (photo, logo, book covers, PDFs…)
src/
  lib/schema.ts           Zod schemas for the three JSON files (the build fails on bad data)
  lib/tenant.ts           loads and validates the tenant chosen for this build
  lib/chat.ts             builds wa.me / t.me links with the pre-written message + ref code
  components/             one component per page section
  app/                    Next.js App Router entry (static export)
scripts/
  build-all.mjs           builds every enabled tenant into dist/<path>/
  prepare-tenant.mjs      copies a tenant's assets into public/tenant/
  validate.ts             checks every tenant's JSON and that referenced assets exist
schema/                   generated JSON Schemas, for autocomplete while editing tenant JSON
```

The template never contains teacher data. At build time `TENANT=<folder>` picks the teacher, their `theme.json` becomes CSS variables, and their `assets/` folder is served at `<basePath>/tenant/`.

## What a teacher can customise (no code)

**content.json**
- `sections`: which sections appear and in what order (`hero`, `grades`, `schedule`, `method`, `book`, `students`, `challenge`, `exams`, `youtube`, `final`). Leave one out to hide it.
- Every message template, e.g. `"السلام عليكم، عايز أحجز في مجموعة {grade} يوم {days} الساعة {time}"`. Placeholders are filled per button.
- `contact.primary`: `whatsapp` (default), `telegram` or `messenger`. `contact.refCodes` adds a short code like `(كود: SCH-P2)` to each message so the team can tell which button the student used.
- `book.order.whatsapp`: a separate number for book orders.
- Exams: mark one `"featured": true` to get the red announcement bar and a live countdown. Exams whose date has passed disappear on the next build (the workflow rebuilds daily).
- `youtube.videos`: add `{ "id": "<youtube video id>", "title": "..." }` to show video cards. Empty shows the channel card only.
- `students.photo`: set a file name to show the class photo; `null` shows the number only.

**theme.json**
- `colors`: 12 tokens (`bg`, `surface`, `raised`, `line`, `accent`, `accentHot`, `accentDeep`, `onAccent`, `text`, `muted`, `subtle`, `online`).
- `fonts`: a Google Fonts URL plus the display, body and numeric stacks.
- `options`: `texture` (`grain`/`none`), `glow`, `heroPhotoShape` (`blob`/`rounded`/`circle`), `tagRotation`, `buttonGlow`.

## Add a new teacher

1. Copy `tenants/mohamed-ali` to `tenants/<new-id>` (lowercase, dashes).
2. Set `"slug": "<new-id>"` in `content.json` and replace the content.
3. Put their files in `assets/` and update the file names in `content.json`. Images and PDFs can be committed as normal files. If you upload through a tool that only accepts text, store the file as base64 next to its name (`photo.webp.b64`, or split into `photo.webp.b64.001`, `.002`, ...); the build decodes it.
4. Adjust `theme.json` to their identity.
5. In `deploy.json`, set `"githubPages": { "path": "<new-id>" }`.
6. `npm run validate`, then push. The workflow builds and publishes everyone.

## Run locally

```bash
npm ci
npm run validate                      # check all tenants
npm run schema                        # (re)generate schema/*.json for editor autocomplete
TENANT=mohamed-ali npm run dev        # http://localhost:3000
TENANT=mohamed-ali npm run build      # static export in out/
npm run build:all                     # every tenant into dist/
```

## Deploy

**One-time setup.** The workflow file is stored at `ci/deploy.yml` because the tool that created this repo isn't allowed to write into `.github/workflows/`. On GitHub, open `ci/deploy.yml`, click the pencil (Edit), change the file name at the top to `.github/workflows/deploy.yml`, and commit. Then go to Settings → Pages and set Source to **GitHub Actions**.

**GitHub Pages (now).** `.github/workflows/deploy.yml` runs on every push to `main`, on demand, and once a day. It validates the data, builds every enabled tenant with `TARGET=pages`, and publishes one Pages site:

```
https://<owner>.github.io/portfolioIO/                 index of teachers
https://<owner>.github.io/portfolioIO/mohamed-ali/     a teacher's site
```

**Own domain per teacher (later, e.g. Cloudflare Pages).** Set `"domain"` in the teacher's `deploy.json`, then build with `TARGET=domain`. Each tenant is built for the root of its own domain into `dist/<slug>/`, which can be uploaded to that teacher's Cloudflare Pages project. `TENANTS=a,b` limits a build to some teachers.

## Stack

Next.js 16 (App Router, static export), React 19, TypeScript, Zod 4. Plain CSS driven by theme variables, so a theme is data rather than code.
