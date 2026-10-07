# portfolioIO

Marketing sites for teachers. One Next.js app serves every teacher on their own domain. Every button on a teacher's page opens WhatsApp with a message already written for that offer (a group, the book, an exam), so the student only has to press send.

Teachers (and you) change their site from `/admin` on their own domain. Changes are live within seconds, with no rebuild or redeploy.

## How it works

```
mohamedali.com ─┐                          ┌─ Supabase Postgres: teachers, domains, logins, revisions
ahmedhassan.com ┼─▶ Vercel (one project) ──┤
<project>.vercel.app/admin (you)           └─ Supabase Storage: teachers' images
```

1. **`src/proxy.ts`** reads the domain of each request and maps it to an internal route `/sites/<site>/...` (see `src/lib/routing.ts`).
2. **The public page** loads that teacher's content and theme from the database through one cached function (`src/lib/server/site.ts`, `"use cache"` + `cacheTag`). Pages are rendered on the server, so Google and AI crawlers get the full HTML. After the first visit a page is served from Vercel's cache.
3. **`/admin`** is protected with basic auth, which is checked in the proxy and again inside every admin page and server action. A save is validated against the Zod schemas (`src/lib/schema.ts`), written to the database with a full revision, and then `updateTag("tenant:<slug>")` clears only that teacher's cached page. The next visitor sees the change.
4. **The admin forms are generated from the Zod schemas.** A new field in `schema.ts` automatically gets a form input; give it an Arabic label in `src/lib/admin/labels.ts`.
5. **Things with a date disappear on their own** (Cairo time): finished exams, the red exam bar (after its end date or the featured exam's day), and the pop-up announcement (after its end date). Cached pages refresh at least hourly, and the bar and pop-up also check their end date in the visitor's browser.

### Page pieces the teacher manages from `/admin`

| Piece | Notes |
|---|---|
| Pop-up announcement (`popup`) | Title, text, optional YouTube video or image, optional button, end date. Shown a moment after the page opens: a centered card on tablet/desktop, a bottom sheet on phones (no full-screen interstitial, which Google ranks down). Once closed it stays hidden on that device for `remindAfterHours` (default 5); editing it shows it to everyone again. |
| Student reviews (`reviews`) | Headline number + stars over a wall of review screenshots; long walls fold behind "show all"; any review opens full size. |
| Other services (`services`) | Cards with image, text, a button to any channel (another WhatsApp number, Telegram, Messenger, call, or link) and optional social links. |
| Social reach (`socials` + `youtube`) | Each social link can carry a follower count and a one-line "why follow"; the YouTube section shows them as cards under a total ("+5,000 followers on all our platforms"). |
| Book (`book.pages`) | Inside pages are stacked behind the cover; hover fans them out, a tap opens them, and any page opens full size. |

Below the teacher's footer every site carries a small, fixed "Developed by" credit (`src/lib/platform.ts`), which teachers can't edit.

| Who | Logs in with | Can do |
|---|---|---|
| You (super admin) | `ADMIN_USER` / `ADMIN_PASSWORD` env vars | Everything: platform console, every teacher, theme, domains, logins |
| A teacher | A username/password you create in the console (stored hashed with scrypt) | Edit their own site's content at `https://<their-domain>/admin`. No theme, no other teachers |

## What's in the repo

```
src/proxy.ts                         domain -> /sites/<site>/... ; basic-auth challenge for /admin
src/app/sites/[site]/                root layout (theme), public page, robots.txt, sitemap.xml
src/app/sites/[site]/admin/          dashboard, section editor, history, platform console, server actions
src/components/admin/                SchemaForm (form generator), SectionEditor, console forms
src/lib/schema.ts                    Zod schemas: content.json / theme.json / deploy.json
src/lib/db/schema.ts                 Drizzle tables: tenants, tenant_domains, admin_users, tenant_revisions
src/lib/server/                      repo (DB access), auth, site (cached reads), storage, assets
db/supabase-setup.sql                one paste-ready SQL file that creates everything (run once)
db/migrations/                       the same SQL as Drizzle migrations
tenants/<slug>/                      seed data for each teacher (imported from the console)
```

Without `DATABASE_URL` the app reads `tenants/*` directly in read-only mode. This is handy for `npm run dev`.

## Form buttons: collect students' details instead of WhatsApp messages

Any WhatsApp button can open a form instead, so the teacher gets a list to call back rather than hundreds of unread chats (a challenge with many answers, bookings, book orders...).

1. **Create a form** in `/admin` → **نماذج جمع البيانات** (Forms): its questions (text, mobile number, number, choice list, long text), required or not, and **remember** (on for things that don't change, like name, phone, grade; off for answers that change each time).
2. **Point a button at it**: every button's editor has **عند الضغط على الزر** (On click): *opens WhatsApp* (default) or *opens form: …*. Works for the hero, top bar, bottom bar, last call, students, schedule bookings, book order, exam booking, the challenge, services and the pop-up.
3. **Students**: the form opens over the page (a sheet on phones) and asks only what isn't remembered on their device yet. What they picked on the page is attached automatically (the challenge question and answer, the group's day/time/place, the book's grade and delivery, the exam and level), so a second request is a single tap ("sent as Ahmed, not you? edit"). The challenge asks for an answer before sending.
4. **Teacher**: `/admin` → **الطلبات** (Requests, with a count of new ones): call or WhatsApp in one tap, mark *contacted* / *done*, search, delete, and **download CSV** (opens in Excel with Arabic and phone numbers intact). Analytics counts a sent form as a contact.

Submissions live in the `submissions` table (run `db/migrations/0003_submissions.sql` once on an existing database). Only the questions the form defines are stored; a hidden honeypot field and duplicate-within-10-minutes check keep out bots and double taps. Phone numbers are personal data: delete requests you no longer need.

**Start dates:** the pop-up (`startsAt`) and the red exam bar (`announcementStarts`) can start later; empty means right away. Together with the end dates they show only inside their window, switching on and off on time even on a cached page.

## Analytics (built in, $0 extra)

Each teacher sees **الإحصائيات** ("Analytics") in their `/admin`; you see every teacher (this month + all time) on the platform console, with a link to each teacher's dashboard.

| Shown | How it's counted |
|---|---|
| Visitors (unique) | Per device/browser, for today, this month, last month and all time. The browser remembers on the device when it last came (localStorage); the server never sees an id |
| Page views | Every load of the page |
| Contacted the teacher (+ % of visitors) | Visitors who clicked a WhatsApp, Telegram, Messenger or call button at least once |
| Went to the teacher's channels (+ %) | Visitors who clicked YouTube, TikTok, Facebook, Instagram, WhatsApp channel or X |
| Clicks by destination and by place | Every link that leaves the page, and which section (or bar, pop-up, menu) it was in |
| Sections reached | Share of views that scrolled to each section |
| Time on page | Seconds the page was actually on screen, until the visitor first left (e.g. to WhatsApp); average + spread |
| Devices, sources | Phone/tablet/desktop; Google, Facebook, Instagram, YouTube, TikTok... (or `?utm_source=` on shared links) |

- **Where it lives:** `src/components/Tracker.tsx` (browser, ~1 KB, `sendBeacon`), `POST /api/v` on each site, daily counters in the `analytics_daily` table (`src/lib/server/analytics.ts`), dashboard at `/admin/analytics`. The browser posts to `POST /api/v` (a neutral name: ad-block lists commonly block `/track` and `/analytics` paths).
- **Privacy:** no cookies, no IP or personal data stored, so no cookie banner is needed. Bots and automated browsers are not counted, and neither is any browser that opened `/admin` on the same address (on `*.vercel.app` that includes the console). The analytics page shows whether the current browser is counted and can switch it back on, which is how to test the counters yourself. Every address of a teacher counts, including `/t/<slug>`.
- **Limits:** a student on two devices counts as two visitors (true of every cookie-free tool). Anyone can send fake events to the endpoint; they can only add to known counters, but there is no rate limit yet (a Vercel WAF rule on `/api/v` is the fix if that's ever abused).
- **Cost:** about 2–4 small requests per visit to your own server and a few dozen rows per teacher per day (~30 MB/year for 10 teachers). It fits in Supabase Free (500 MB) and Vercel Pro's included usage; nothing to subscribe to.
- **Existing database:** run `db/migrations/0002_analytics.sql` once in Supabase's SQL Editor (or `npm run db:migrate`). New setups get it from `db/supabase-setup.sql`.

## Claude connector (MCP): onboard and edit teachers by chat

The app is also an MCP server, so Claude (claude.ai, the Claude apps, or Claude Code) can do everything the admin panel does, straight on the live database: create a teacher, fill or change any section, upload and place photos, theme, domains, logins, history and analytics. Saves go through the same validation as the admin forms, keep a full revision (and can be restored), and are live within seconds.

**Turn it on (once):**
1. Generate a secret: `openssl rand -hex 32` (or any 32+ random characters).
2. Vercel → Settings → Environment Variables: add `MCP_TOKEN` with it, then redeploy.
3. Connect Claude:
   - **claude.ai / Claude apps:** Settings → Connectors → Add custom connector → URL `https://<your-project>.vercel.app/api/mcp/<MCP_TOKEN>` (leave OAuth empty). Enable it in a chat from the tools menu.
   - **Claude Code:** `claude mcp add --transport http portfolioio https://<your-project>.vercel.app/api/mcp --header "Authorization: Bearer <MCP_TOKEN>"`

**Then just ask**, e.g. "Create a page for أ. سارة أحمد, math teacher, grades 1-3 secondary, groups in Faisal Sat/Tue 5pm, WhatsApp 2010..., use a blue theme", or "Move Sara's Tuesday group to 6pm and add a popup announcing the new term until the 1st". For photos Claude sends you a private upload link (it can't forward images attached in the chat): open it, drop the photos (naming them teacher.jpg, book-cover.jpg... helps), say done, and Claude looks at each one and puts it in place. Public Google Drive/Dropbox links work too.

| Tools | |
|---|---|
| Read | `list_teachers`, `get_teacher`, `get_schema` (page outline, or one section's fields with the admin labels/hints), `get_example` (a full real page), `list_revisions`, `get_analytics` |
| Write | `create_teacher` (full content, or `copy_from` + edits), `update_content` (whole sections), `edit_content` (path edits like `schedule.slots.2.time`, all in one revision), `update_theme`, `set_teacher_status`, `restore_revision` |
| Photos | `create_upload_link`, `upload_image` (link or base64), `list_images`, `view_image` |
| Platform | `manage_domain` (then add the domain in Vercel too), `manage_login` (create/reset shows the password once) |

**Security:** the token is the key to every teacher, as powerful as `ADMIN_PASSWORD`. In the claude.ai form it is part of the URL, so treat the connector URL like a password and rotate `MCP_TOKEN` if it leaks (the old URL stops working). Without `MCP_TOKEN` the endpoint doesn't exist; it answers only on the platform host, and wrong tokens get a plain 404. Saves are recorded as "Claude (MCP)" in the history. Upload links are signed per teacher and expire (24 h by default). Image downloads from links only reach public internet addresses (no internal/cloud-metadata addresses), up to 4 MB.

## Set it up (about 30 minutes, once)

### 1. Supabase (database + images)

1. Create a project at [supabase.com](https://supabase.com). Pick the **Frankfurt (eu-central-1)** region, the closest to Egypt, and save the database password it asks for.
2. **Create the tables:** open **SQL Editor → New query**, open `db/supabase-setup.sql` in GitHub, copy **everything inside the file** (use the Copy raw file button), paste it into the editor, and click **Run**. Paste the SQL text, not the file name or path: typing `db/...` into the editor gives a `syntax error at or near "db"`. This one file creates the tables and blocks Supabase's public Data API from them.
   *Or from your machine: `DATABASE_URL=... npm run db:migrate`.*
3. Collect three values:
   - **DATABASE_URL:** click **Connect** at the top, choose **Transaction pooler** (port **6543**), copy the URI, and put your DB password in it.
   - **SUPABASE_URL:** Project Settings → API → Project URL.
   - **SUPABASE_SECRET_KEY:** Project Settings → API Keys → Secret keys → create one (`sb_secret_...`). Keep it secret: it can read and write everything.

   You don't need to create the images bucket; the first import creates a public bucket called `tenant-assets`.

> The free Supabase plan **pauses a project after 7 days without requests**, and it has no backups. Teacher sites get visits, so pausing is unlikely, but upgrade to Pro ($25/month) before you rely on it.

### 2. Vercel (hosting)

1. At [vercel.com/new](https://vercel.com/new), import the GitHub repo `portfolioIO`. Vercel detects Next.js, so keep the defaults.
2. Before deploying, add **Environment Variables**: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_USER`, and `ADMIN_PASSWORD` (24+ random characters). Optional ones are listed in `.env.example`.
3. Deploy.
4. In **Settings → Functions → Function Region**, choose **Frankfurt (fra1)** so the server sits next to the database, then redeploy.

> Vercel's free **Hobby plan is for non-commercial use only**. This is a paid business, so use **Pro** ($20/month per developer seat). The 14-day Pro trial is fine for testing.

### 3. Load the first teacher

1. Open `https://<your-project>.vercel.app/admin` and log in with `ADMIN_USER` / `ADMIN_PASSWORD`.
2. Click **استيراد** ("Import"). This copies `tenants/mohamed-ali` into the database and uploads his images.
3. Preview the site at `https://<your-project>.vercel.app/t/mohamed-ali`. Preview addresses are marked noindex.

### 4. Give the teacher his domain

1. In the console click **إدارة** ("Manage") next to the teacher, add `mohamedali.com` (and `www.mohamedali.com` if you want it), and choose the primary one. The primary one is what Google indexes.
2. In Vercel go to **Settings → Domains → Add** and add the same domain(s). Vercel shows the DNS records to create; usually an **A** record for the bare domain and a **CNAME** for `www`.
3. Add those records at the registrar where the domain was bought. HTTPS is issued automatically once DNS resolves (minutes, sometimes up to a few hours).

### 5. Give the teacher a login

On the teacher's **إدارة** ("Manage") page, enter a username and click **إنشاء حساب** ("Create account"). Copy the password and the login link shown (the password is only shown once) and send them to the teacher with the username. **كلمة مرور جديدة** ("New password") resets it.

The username is not case sensitive and stray spaces are ignored (phones capitalize the first letter). A teacher who logs in on the platform's own `/admin` is sent to their site's admin automatically, and `www.` and the bare domain both work even if only one was added.

### Adding the next teacher

- In the console, click **+ مدرس جديد** ("New teacher") and copy an existing teacher as a template.
- Edit the new teacher from **تعديل المحتوى** ("Edit content"); images can be replaced from the forms.
- Then add their domain and login as above. No code, no deploy.

(Optional) With `ROOT_DOMAIN=portfolioio.com` and a wildcard domain `*.portfolioio.com` on Vercel (this needs Vercel nameservers), every teacher also gets `https://<slug>.portfolioio.com`, which is useful before they buy a domain.

## Run locally

```bash
npm install
npm run dev                         # no database: reads tenants/*, http://localhost:3000/t/mohamed-ali
cp .env.example .env.local          # then fill it in to use a real database
npm run validate                    # check tenants/* JSON and assets
npm run typecheck
```

- Locally, `localhost` is the platform host: the console is at `/admin`, and teachers are at `/t/<slug>` and `/t/<slug>/admin`.
- Without Supabase Storage, uploads are saved to `.local-storage/`.

## Changing the data model

1. Edit `src/lib/schema.ts` (content/theme). Old data keeps working if new fields are optional or have defaults.
2. Add Arabic labels for new fields in `src/lib/admin/labels.ts`.
3. Database tables are defined in `src/lib/db/schema.ts`. After changing them, run `npm run db:generate` and commit the new file in `db/migrations/`. Then apply it in Supabase's SQL Editor or with `npm run db:migrate`.

## Security

**In place now:**
- **Logins:**
  - Teacher passwords are hashed with scrypt.
  - Login checks take the same time for unknown usernames.
  - The super admin password is compared in constant time.
- **Authorization:** basic auth is checked in the proxy and again inside every admin page and server action. A teacher can only reach their own teacher's data, and the platform console accepts only the super admin.
- **Database:** RLS is on with no policies, so Supabase's public Data API can't touch these tables. The app's database URL and secret key are only used on the server.
- **Saving:**
  - Every save is validated against the schemas and keeps a full revision, so any change can be restored.
  - If two people edit the same site at once, the second save is refused instead of silently overwriting the first.
- **Uploads:**
  - Images only (JPG, PNG, WebP, GIF, AVIF; no SVG).
  - Up to 4 MB, and the file's first bytes must match its type.
  - Random file names.
- **Search engines:** `/admin` responses are `no-store` and `noindex`. Previews and secondary domains are `noindex`.

**Known risks to fix next (not implemented yet), most important first:**

| # | Risk | Why it matters | Suggested fix |
|---|---|---|---|
| 1 | **Link fields accept `javascript:` URLs** (`nav[].href`, `hero.secondaryCta.href`, `sticky.secondary.href`, socials) | A teacher could plant a script link on their page. If you click it while logged in on the platform host (same origin as `/admin`), it runs with your super-admin session | In `schema.ts`, only allow `https:`, `http:`, `#`, `/`, `tel:`, `mailto:`. Also serve the console from its own host (see 6) |
| 2 | **No brute-force protection** on basic auth | Passwords can be guessed by trying many times; each attempt also costs server CPU (scrypt) | Vercel WAF rate-limit rule on `/admin` (e.g. 20 requests/min per IP), lockout after N failures per username, alerts on failures |
| 3 | **Basic auth itself** | No logout, the browser re-sends the password on every request, easy to phish, no 2FA | Replace with session logins (Supabase Auth or Auth.js): HttpOnly SameSite cookies, logout, password change, 2FA for the super admin |
| 4 | **Single super-admin password in env vars** | One shared secret with full power; leaks via screenshots or chats | Long random value now; later move admins to the database with hashed passwords, per-person accounts, 2FA and an audit log |
| 5 | **Login cache of 60 s per server instance** | A disabled user or reset password can keep working for up to a minute | Store a credentials version in the cache key, or drop the cache once sessions exist |
| 6 | **Admin and public site share one origin** | Any script injection on a teacher page can act as the logged-in admin | Serve the console only on `admin.<your-domain>` (`PLATFORM_HOSTS`); add a CSP and `frame-ancestors 'none'` |
| 7 | **No security headers** (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy) | Clickjacking of `/admin`, weaker defense-in-depth | `headers()` in `next.config.ts`; strict CSP for `/admin` |
| 8 | **Powerful secrets** (`SUPABASE_SECRET_KEY`, `DATABASE_URL` as the table owner) | A leak exposes and allows changing every teacher's data | Mark them Sensitive in Vercel; use a least-privilege Postgres role for the app (no DDL); rotate keys; never prefix with `NEXT_PUBLIC_` |
| 9 | **Uploaded images are public and not re-encoded** | EXIF metadata (e.g. GPS from phone photos) is published; crafted files are stored as-is; no storage quota | Re-encode/strip metadata with `sharp`, per-teacher quotas, delete images no revision uses |
| 10 | **Tenant isolation lives in app code** | A future bug in a query could leak across teachers | Keep the end-to-end isolation tests; add per-tenant RLS policies with the tenant id set per request |
| 11 | **Domains are added to Vercel by hand** | A domain removed from one side and not the other can be left dangling | Automate with the Vercel Domains API and check DNS ownership |
| 12 | **No backups on Supabase Free**, no monitoring | Data loss; problems go unnoticed | Supabase Pro (daily backups), scheduled `pg_dump`, Vercel log drains/alerts |

## Stack

Next.js 16 (App Router, Cache Components, proxy), React 19, TypeScript, Zod 4, Drizzle ORM + postgres.js, Supabase (Postgres + Storage), Vercel.
