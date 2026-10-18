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
5. **Things with a date disappear on their own** (Cairo time): finished exams, red-bar messages (after their end date, or the featured exam's day for messages with {date}), and the pop-up announcement (after its end date). Cached pages refresh at least hourly, and the bar and pop-up also check their end date in the visitor's browser.

### Page pieces the teacher manages from `/admin`

| Piece | Notes |
|---|---|
| Pop-up announcement (`popup`) | Title, text, optional YouTube video or image, optional button, end date. Shown a moment after the page opens: a centered card on tablet/desktop, a bottom sheet on phones (no full-screen interstitial, which Google ranks down). Once closed it stays hidden on that device for `remindAfterHours` (default 5); editing it shows it to everyone again. |
| Student reviews (`reviews`) | Headline number + stars over a wall of review screenshots; long walls fold behind "show all"; any review opens full size. |
| Sections menu (`menu`) | Every visible section in one list. The header's menu button (on the right in Arabic; the logo moves to the left) opens and closes it on every screen: docked at the side and open by default on computers (≥1100px; closing it is remembered on the device), sliding over the page on tablets and phones. The section being read is highlighted. On by default; the teacher can switch it off, rename it, or list their own names and order (admin → ترتيب الأقسام والقوائم). Shown when there are at least 3 sections. |
| Schedule | Four or more groups (after the visitor's filters) swipe as a carousel; three or fewer stay as cards. Automatic, not a setting. |
| Display of lists (`display`) | Exams, videos, method, services, featured cards and reviews each choose **auto** (swipe on phones; on bigger screens the usual grid, or swiping when there are more cards than fit in a row), **carousel** (swipe with arrows and dots everywhere), **grid**, or **list** (one under the other). |
| Featured (`featured`) | Offers, new courses, videos, announcements: cards with a badge, title, text, YouTube video or image, check-mark points, price and crossed-out old price, a countdown to the end date, and up to two buttons (any channel or a form). Each card shows between its start and end dates; the first card can span the full width. |
| Self-grading quizzes (`quizzes[].selfGrading`) | For quizzes shared to reach new students: the student sees their grade, pass/fail and each answer (right, wrong, or graded by the teacher; the right answers too unless `showCorrect` is off) as soon as they hand in, with an optional line and button under the grade (`resultMessage`, `resultCta`). The answer key only leaves the server after hand-in. The teacher still gets every attempt (name, phone, answers, score) to follow up, but these quizzes have no exam results and no approval step. Without it, students see no grade; the teacher grades and approves, and approved grades go to the exam results. |
| Referral partners (`referrals`) | Affiliate marketing, part of the **promo** plan bundle. The teacher adds partners (influencer, page, center) with a short code; admin → «روابط الشركاء» lists each partner's ready links to the site, every quiz, every vote and every form (`?ref=<code>`, plus `&form=<id>` to open a form right away). Visits and unique visitors are counted per partner and page; requests, quiz attempts (started / submitted) and votes the visitor sends within 30 days are credited to the partner (last partner wins). Requests and attempts show «عن طريق …» and the requests export has a «الشريك» column. |
| Site language (`locale`) | Each teacher picks **Arabic** (`ar-EG`, right-to-left) or **English** (`en`, left-to-right) in the admin under «اللغة والنصوص العامة». English flips the whole layout and switches every built-in text (buttons, countdowns, errors, quiz, vote and results screens, the sections menu, dates) to English (`src/lib/i18n.ts`); ready-made texts the teacher never changed (default button labels, day names, AM/PM) follow too. The teacher writes their own content in that language. One language per site; the admin panel stays Arabic, and the super admin console shows each teacher's language. |
| Honor board (`honors`) | The teacher's top students: each entry has one or more photos (a grid when there are several, tap to open full size), a name, the grade/score shown big, the class and year, short lines with icons, an optional YouTube video, a long description folded after a few lines ("read more"), and an optional button; plus an optional button under the board. |
| Group status (`schedule.slots[].status`) | Optional per group: **available** (green "فيه أماكن"), **full** ("كامل العدد"; the button joins the waiting list), or **not started** ("لسه مبدأتش" with its start date; the button books a place early). The not-started label drops on its own once the start date comes. |
| FAQ (`faq`) | Questions and answers that open one at a time (no script), first one open, an optional "still have a question?" button. Described to search engines as a `FAQPage`. |
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

## The red bar (announcements at the top)

Its own editor page (**الشريط الأحمر**), not part of the exams any more: a short list of messages for anything worth promoting (an exam, results are out, a new video, the book). Each message has its text, an icon, where tapping goes (a section of the page, or a link: a page of the site like `/exam-oct`, a YouTube video, any website) and optional start/end dates. One message shows at a time, the first in the list whose dates are current, so promotions can be lined up and swap on their own. `{date}` in a message is the featured upcoming exam's date; such a message ends with that exam's day and isn't shown without one. Sites saved before this change are converted automatically when read (the exam's bar becomes the first message, pointing at the exams section); the next save stores the new shape.

## Form buttons: collect students' details instead of WhatsApp messages

Any WhatsApp button can open a form instead, so the teacher gets a list to call back rather than hundreds of unread chats (a challenge with many answers, bookings, book orders...).

1. **Create a form** in `/admin` → **نماذج جمع البيانات** (Forms): its questions (text, mobile number, number, choice list, long text), required or not, and **remember** (on for things that don't change, like name, phone, grade; off for answers that change each time).
2. **Point a button at it**: every button's editor has **عند الضغط على الزر** (On click): *opens WhatsApp* (default) or *opens form: …*. Works for the hero, top bar, bottom bar, last call, students, schedule bookings, book order, exam booking, the challenge, services and the pop-up.
3. **Students**: the form opens over the page (a sheet on phones) and asks only what isn't remembered on their device yet. What they picked on the page is attached automatically and never remembered (the challenge question and answer, the group's day/time/place, the book's grade and delivery, the exam and level), so the form only needs what isn't on the page, and a second request is a single tap ("sent as Ahmed, not you? edit"). The challenge asks for an answer before sending.
4. **Teacher**: `/admin` → **الطلبات** (Requests, with a count of new ones): call or WhatsApp in one tap, mark *contacted* / *done*, search, delete, and **download CSV** (opens in Excel with Arabic and phone numbers intact). Analytics counts a sent form as a contact.

Submissions live in the `submissions` table (run `db/migrations/0003_submissions.sql` once on an existing database). Only the questions the form defines are stored; a hidden honeypot field and duplicate-within-10-minutes check keep out bots and double taps. Phone numbers are personal data: delete requests you no longer need.

**Start dates:** the pop-up (`startsAt`) and each red-bar message (`bar.items[].startsAt`) can start later; empty means right away. Together with the end dates they show only inside their window, switching on and off on time even on a cached page.

## Quizzes

Timed quizzes on their own page, e.g. `teacher.com/exam-oct`, managed from `/admin` → **الاختبارات** (Quizzes).

- **Set up** (admin → edit quizzes): the page name, title and intro, an optional form asked before starting (name, phone…), duration in minutes (0 = no timer), start/end dates, pass percentage, and questions. Each question has text and/or an image, is multiple choice or written, and may list its correct answers: several accepted spellings for written ones, compared without extra spaces, upper/lower case, Arabic diacritics, and with Arabic digits and decimal point equal to Latin ones. Questions without correct answers aren't graded; students can leave any question empty.
- **Open/close**: *automatic* follows the dates; **Open now** / **Close now** buttons override them (closing also ends attempts in progress).
- **Students**: fill the form (nothing is sent yet but the start), then answer with a countdown. Questions load only when they start, and the answer key never leaves the server. The deadline is kept by the server and answers are saved as they go, so a refresh (or another device with the same number) continues with the same answers and remaining time, and when time is up the latest answers are handed in, even if the page was closed. After handing in (button or timer), the quiz can't be taken again on that device or, if the form has a mobile number, with that number. Students don't see their score.
- **Grading** (on the quiz's results page): each finished student gets a grade box with the score (the automatic score from the answer key is filled in, change it for written answers), a comment for the student, and **Approve** / **Save as draft** / **Unapprove**. Approved grades go straight into the quiz's own exam results (below), so the student finds their score and the comment with their name and phone. **Approve all** approves everyone not approved yet with their automatic score or draft. Filters: all / needs grading / approved.
- **Results** (one page per quiz): started / finished / timed out / in progress, completion rate, average, median and top score, pass rate, average time, score distribution, questions from hardest with their most common wrong answers, every student ranked by score with their answers marked, tap to call/WhatsApp, delete (lets them retake), and CSV export for Excel. Scores are worked out from the current answer key, so fixing a key updates past results.

Attempts live in `quiz_attempts` (run `db/migrations/0004_quizzes.sql` once on an existing database). Claude can create and edit quizzes through the connector and read results with `quiz_results`. Don't reorder questions after students start: answers are stored by question number.

## Plans (what each teacher's site includes)

Super admin console → a teacher → **الباقة (الصلاحيات)**: five bundles and a forms limit (`lib/permissions.ts`, stored in `tenants.permissions`).

| Bundle | Covers |
|---|---|
| الإحصائيات | The analytics page in the teacher's admin |
| ملفات الطلاب | Student profiles (below) |
| النماذج والطلبات | Data-collection forms on buttons, the requests page and its export; optional **max forms** (forms used only by a quiz don't count) |
| الاختبارات والنتايج | Online quizzes, grading, and exam results students look up |
| التصويتات | Vote pages |
| أدوات الإعلان | Pop-up, red bar, featured section |

- **New teachers start with none; teachers created before plans existed keep everything** (migration `0010` sets them all on).
- A bundle that's off can be prepared and **saved to the preview**, but **not saved or published to the site**. Only parts a save changes are checked, so editing the rest still works. Grading and exam-results changes are refused too.
- It's **left out of the live site right away**: quiz and vote pages return not found, the results button and its API go, buttons that opened a removed form fall back to WhatsApp. Switching it back on brings everything back.
- The analytics and requests pages show a "not in your plan" message instead of the data. The teacher's dashboard lists what's not included.
- Plans apply to **everyone** editing that site in its admin panel, the super admin included, and to Claude's content edits.

## Student profiles (admin → الطلاب)

One profile per student, identified by their mobile number (compared like the results lookup: no country code or leading zero), built automatically from what they do on the site: form requests, quiz attempts (with the teacher's approved grade or the automatic score) and the exam results the teacher typed or imported. Votes are anonymous, so they don't count.

- **Profile fields grow on their own:** every form field has **«يتحفظ في ملف الطالب»** (on by default, except long text). The student's latest answer updates their profile (grade, school…). The name follows the newest, fullest spelling.
- **The teacher's own data:** edit the name and any field, delete fields, add their own (parent's phone, group…), and keep private notes. What the teacher types is never overwritten by a later form.
- **Numbers and progress:** requests, quizzes taken, average quiz %, exams, average exam %, first and last activity, the change between the last two grades, and a chart of every grade over time. The profile lists the student's quizzes (with grade and comment) and requests.
- **List:** search by name, phone or any profile value; sort by activity, name, averages or engagement; add a student by hand (e.g. from a paper list); **download all profiles as Excel (CSV)** with one column per profile field.
- Profiles are synced from new activity whenever the students pages open (`students`, `student_sync`, and `student_id` on requests and quiz attempts; migration `0011`). The public forms and quizzes are unchanged. Plan bundle **ملفات الطلاب** (on for existing teachers); data keeps being collected while it's off.

## Votes (anonymous polls)

Admin → **التصويتات**. A vote has its own page (`teacher.com/<path>`, like quizzes) so the teacher can paste the link in a story or a group; it isn't part of the main page and isn't listed by search engines.

- **Set up** (admin → edit votes): the question, an optional description and images, two or more choices (each with an optional image), the duration in hours, the button text, the thank-you message, and whether students see the results after voting.
- **One countdown for everyone**: the vote runs from its start for its duration. A vote saved without a start starts when it's saved; **ابدأ العداد من دلوقتي** restarts it. If a 4-hour vote has been running for 3h50m, anyone opening the link sees 10 minutes left. The page uses the server's clock, so a wrong phone clock doesn't matter. **Open now** / **Close now** override the timer.
- **Anonymous**: students only pick a choice. Only a count per choice is stored (`poll_votes`); a cookie on the device ("voted", no id) keeps the same browser from voting twice. Votes are counted by choice position, so don't reorder choices once voting starts.
- **Results**: votes per choice with percentages, the share link with a copy button, and a reset. Claude: `poll_results`.

## Exam results (students look up their grade)

Under the upcoming exams, the exams section gets a **نتايج الامتحانات اللي فاتت** button (text editable in the exams section) once at least one exam's results are published. The student picks an exam (title and date), types their name and phone, and sees their score (out of the full mark, with a percentage and the teacher's note). They see only their own row; nothing else leaves the server.

- **Same form as the buttons**: the name and phone are the student's remembered answers from the form buttons (same device storage, same field ids), so a student who already filled any form gets their result in one tap ("not you? edit"). A found result remembers them for next time.
- **Matching**: the phone is compared without the country code or leading zero (`+20 100…`, `0100…`, `100…` written by Excel and Arabic digits all match), and the **first name** with spelling noise removed (diacritics, أ/إ/آ, ة/ه, ى/ي, punctuation, extra spaces; "عبد الله" counts as one name). Brothers sharing a parent's number are told apart by first name. A miss doesn't say which part was wrong. Lookups are limited per visitor to stop guessing numbers.
- **Admin** → **نتايج الامتحانات**: new results for an exam on the page (title and date filled in) or any other; full mark optional. **Add from Excel**: an `.xlsx`, `.csv`, or cells copied from Excel and pasted (or typed `name, phone, score` lines). Columns are recognised from their headers or values (a seat-number column isn't mistaken for the phone) and can be changed; a preview and a list of rows to check (missing or unclear numbers) come first. Importing again *adds and updates*: a student already there (same phone + first name) gets the new score, keeping their fuller name and note; or *replace all*. Then edit, add or delete rows by hand, test a name/phone as a student would, and **Publish** / hide. Each exam shows how many students looked up their result and how many found it. Excel files are read in the browser with no extra package (old `.xls` files: save as `.xlsx`, or copy-paste).

- **Online quizzes**: every quiz gets its own exam results automatically (created empty, already published; students only see it once a grade is approved). Approved grades appear there read-only, and rows can still be added by hand or from Excel (e.g. students who sat the exam on paper). Hide it with the usual buttons; it can't be deleted while the quiz exists.

Stored in `exam_results` and the grade columns of `quiz_attempts` (migrations `0006_exam_results.sql` and `0008_quiz_grading.sql`, applied by the build). Claude: `exam_results`, `manage_exam_results` and `grade_quiz`.

## Preview and production

Every teacher has two copies of their page in the same deployment and database: **production** (the public site) and a private **preview** at `<their address>/preview` (e.g. `teacher.com/preview`, or `/t/<slug>/preview` on the platform host).

- **Private**: the preview asks for the admin login (the same basic auth as `/admin`, so a browser that's logged into the admin opens it directly). Anyone else gets "Authentication required". It's never indexed (`noindex, nofollow` header and meta, blocked in robots.txt, no structured data) and shows a yellow "private preview" bar on every page.
- **Editing**: every editor page has **Save to preview** and **Publish to site**. The editor always shows the preview copy (the same as the site until something is saved to preview). Publishing one page directly also puts the change into the preview copy, so the preview always shows the live site plus whatever is still unpublished.
- **Admin home**: "View preview" and "View site" links, and while the preview has unpublished edits, a panel listing the changed pages with **Publish all to site** and **Discard preview edits**. Changed pages are marked "في المعاينة".
- **Data per environment**: requests, quiz attempts, analytics and exam-result lookups made from the preview are stored as preview data. The switch at the top of the admin panel (**الموقع / المعاينة**) chooses which environment's data the requests, quizzes, results, analytics and home pages show. Opening and closing a quiz while on preview changes only the preview copy. A phone number that tried a quiz in preview can still take the real one. Analytics in preview always count (they're only ever you); the platform overview counts production only.
- **Exam results** are shown in the preview and on the site separately (**Show in preview** / **Publish to site**), each with its own lookup counts.
- **History** labels each version as site or preview; restoring a preview version only changes the preview.
- **Super admin**: the console links each teacher's site and preview, and the same switch works inside any teacher's admin.
- **Claude**: content edits go to the preview by default (`target: "production"` changes the live site directly); `publish_preview` publishes or discards; data tools take `env`.

Run `db/migrations/0007_preview_env.sql` once on an existing database. Nothing to set up in Vercel: no second project, domain or deployment.

## Images and search basics

- **Every upload is compressed** (admin panel, photo upload links, Claude): `sharp` turns it upright, scales it to at most 1600px (tall screenshots 2600px), re-encodes it as WebP (quality 80) and drops all metadata, including phone GPS locations. Phone photos are first scaled down in the browser (canvas, no library) so they fit the ~4 MB request limit; from a link (Claude) up to 20 MB is accepted. Images uploaded before this change are left as they were.
- **Share image**: without an uploaded one (SEO → share image), `/og.png` builds one from the teacher's photo, logo and colors (1200×630, no text). Its URL changes with every save, so WhatsApp/Facebook pick up changes.
- **Sitemap** lists the home page and the quizzes switched to "show in Google", with the last-save date. **robots.txt** keeps `/admin`, `/api/` and `/upload` from being crawled; every other page can be fetched (so Google's testing tools work on preview links too), and preview links and secondary domains carry `noindex` instead. Quiz pages are hidden from Google unless switched on per quiz, and only ever indexed on the teacher's main domain.
- **Structured data (schema.org JSON-LD)** is built on every page from the teacher's content, with no setup: the teacher (Person), their center (EducationalOrganization) with a catalog of every grade and subject and its weekly groups (days, time, place), upcoming exams (EducationEvent, with the fee as an Offer when it has a number), and the book. Types Google would mark invalid for missing data are avoided: no `Course` (needs price, duration, session count) and no `VideoObject` (needs an upload date). Only what the page shows is described; testimonials are never marked up as reviews (Google ignores self-written ones). Code: `src/lib/structured-data.ts`; `npm run validate` (and CI) checks every bundled teacher's output for missing required fields, broken links between entities and bad dates. After deploy, paste the live URL into Google's Rich Results Test or validator.schema.org.

## Site files (Search Console verification and similar)

Small text files a teacher's site serves from its root, managed by you only: console → teacher → **إدارة** → **ملفات الموقع** (Site files), or Claude's `manage_site_files` tool. Use it for Google Search Console's HTML-file verification (upload `google….html` exactly as downloaded, then press Verify), Bing's `BingSiteAuth.xml`, IndexNow keys, `ads.txt`, or `.well-known/…` files. Stored in the `tenant_files` table (run `db/migrations/0005_site_files.sql` once on an existing database), never in the repo; live within seconds on the teacher's domain(s) and preview address. Names: letters/digits/`._-` with `.html`, `.txt`, `.xml` or `.json`, or anything under `.well-known/`; up to 64 KB of text. `robots.txt`, `sitemap.xml`, `og.png` and `favicon.ico` are reserved. HTML files are served sandboxed (no scripts run on the teacher's domain).

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

## Overall stats (super admin)

Platform console → **الإحصائيات العامة** (`/admin/stats` on the platform host): every teacher's public site together (the private preview is left out).

- **Date filter**: today, last 7 / 30 days, this month, last month, all time, or any from–to range (Cairo days).
- **Totals**: teachers (published, added in the range), page views, unique visitors, engagements, and the share of visitors who engaged. Unique visitors are exact for a day, a calendar month and all time (summed across teachers, so one person visiting two teachers counts twice); for other ranges the page says it shows the sum of each day's unique visitors.
- **Engagements** = contact clicks (WhatsApp, Telegram, Messenger, call) + channel clicks (YouTube, TikTok, Facebook…) + sent forms + quiz attempts + exam-result lookups, each shown on its own too, with exam bookings (forms sent from an exam card), finished quizzes, result lookups that found a grade, and video plays (not counted as engagement).
- **Exams**: online quizzes, exam cards on the pages, exam-result sheets and the grades in them.
- **Trend charts** for views, visitors, engagements and in-page actions (forms, quizzes, result lookups): per day, or per month for ranges over about three months, with a table view.
- **Per-teacher table** with the same numbers and a link to each teacher's own analytics.

Result lookups are counted by day from this version on (earlier lookups only exist as each exam's lifetime total).

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

## Environments and releases (dev → production)

```
feature/* ──PR──▶ develop ──(auto)──▶ DEV   portfolio-io-dev.vercel.app   (dev Supabase project)
                     │
                 release PR develop → main  (CI green + owner's approval)
                     ▼
                   main ──(auto)──▶ PRODUCTION  ostaz-io.vercel.app + teachers' domains  (prod Supabase)
```

- **Dev** is a separate copy of the platform for testing code: its own Supabase project (database and images), its own admin login, its own `MCP_TOKEN`. Every Vercel deployment that isn't `main` (the `develop` branch and every feature-branch preview) uses the dev settings, so nothing tested there can touch real students' data. With `APP_STAGE=dev` every page asks for the dev admin login, nothing is indexed, and a "DEV" bar shows on every page. Teachers are at `/t/<slug>` there (their domains stay on production).
- **Preview** (inside the admin panel) is different: it's the teacher's unpublished *content* on the production site. See "Preview and production".
- **Releasing**: work goes into `develop` through pull requests (CI must pass), is checked on the dev URL, then a release PR `develop → main` lists the changes and migrations. `main` is protected: it needs CI green and the owner's approval. Merging deploys production.
- **Hotfix**: branch from `main`, PR into `main` (same approval), then merge `main` back into `develop`.
- **Rollback**: Vercel → Deployments → previous production deployment → Instant Rollback.
- **Migrations** run during the Vercel build (`scripts/vercel-build.mjs`): for `develop` on the dev database, for production on the production database, never for feature branches. A failing migration fails the build and the previous version keeps serving. Write migrations backward compatible (add columns/tables; rename or drop only in a later release, after the code stops using them), because the old version keeps running until the new one is live. Applied migrations are recorded in `public._portfolio_migrations`.
- **CI** (`.github/workflows/ci.yml`, on every PR into `develop`/`main`): typecheck, `npm run validate`, every migration applied twice on an empty Postgres, and a production build.
- **Dev data is its own**: nothing is copied between dev and production, in either direction. Create test teachers on dev from the dev platform console (`/admin` on the dev URL); they never exist in production, and production teachers never appear on dev.
- **Stage marker (the hard separation)**: each database holds one row in `public._portfolio_stage` saying `dev` or `production` (and which Supabase project its files live in). The build's migration step (`scripts/db-stage.mjs`) and the running app (`src/lib/db/stage.ts`) both check it against `APP_STAGE` and `SUPABASE_URL`, and refuse to read or write anything when they don't match. A dev deployment pointed at the production database fails to build and serves no data, and the other way round. A brand-new empty database is marked automatically by `npm run db:migrate`; to mark an existing one, run once in its SQL editor:
  ```sql
  create table public._portfolio_stage (id boolean primary key default true check (id), stage text not null check (stage in ('dev', 'production')), supabase_ref text, set_at timestamptz not null default now());
  alter table public._portfolio_stage enable row level security;
  insert into public._portfolio_stage (stage, supabase_ref) values ('dev', '<project ref>');  -- or 'production'
  ```
- Free Supabase projects pause after a week without use; resume the dev project from the Supabase dashboard if the dev site can't reach its database.

| Vercel env var | Production (`main`) | Preview (`develop` and feature branches) |
|---|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | production project | dev project |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | production project | dev project |
| `ADMIN_USER`, `ADMIN_PASSWORD`, `MCP_TOKEN` | production values | different dev values |
| `APP_STAGE` | (unset) | `dev` |

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

### Free trials (the platform's home page)

Visitors build a 24-hour trial site from the form on the platform's home page. To keep trials from being copied:

- **Phone check:** the WhatsApp number is confirmed with a code before the site is built, and each number gets one trial. Codes are sent by [Twilio Verify](https://www.twilio.com/docs/verify): set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID` (Production). `OTP_CHANNEL=whatsapp` sends codes on WhatsApp instead of SMS (the Verify service needs a WhatsApp sender). `OTP_COUNTRIES` lists the calling codes allowed (default `20`, Egypt). Without the Twilio settings the code step is skipped; one trial per number still applies. `OTP_TEST_CODE` sets a fixed code on dev or locally, never in production.
- **Terms:** the form requires accepting `/terms` (the design and ready content belong to the platform; no copying). The acceptance time is stored on the tenant.
- **Watermark:** trial sites show a trial bar and a light myostaz.com watermark over every page and on the photo, block saving images with a right click, and print blank.
- **No bots:** trial sites are never indexed, and AI assistants, AI crawlers and copying tools (by user agent) get a 403 (`src/lib/server/bots.ts`). WhatsApp and Facebook link previews still work.
- **Photo:** the teacher's photo has its background removed in the browser (`src/lib/cutout.ts`, MediaPipe's selfie segmenter, nothing uploaded elsewhere), so the hero shows them on the site's colors. Admins get the same "شيل الخلفية" button on the profile photo.

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
| 9 | **Uploaded images are public**, no storage quota | Anyone with a link can view them; storage only grows (images are now re-encoded with `sharp` and stripped of metadata, see "Images") | Per-teacher quotas, delete images no revision uses |
| 10 | **Tenant isolation lives in app code** | A future bug in a query could leak across teachers | Keep the end-to-end isolation tests; add per-tenant RLS policies with the tenant id set per request |
| 11 | **Domains are added to Vercel by hand** | A domain removed from one side and not the other can be left dangling | Automate with the Vercel Domains API and check DNS ownership |
| 12 | **No backups on Supabase Free**, no monitoring | Data loss; problems go unnoticed | Supabase Pro (daily backups), scheduled `pg_dump`, Vercel log drains/alerts |

## Stack

Next.js 16 (App Router, Cache Components, proxy), React 19, TypeScript, Zod 4, Drizzle ORM + postgres.js, Supabase (Postgres + Storage), Vercel.
