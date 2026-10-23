# Handoff: sections v3 (work in progress)

Branch `wip/sections-v3` (from `main` after PR #2). **Not buildable yet**: finish the steps below, then open a PR to `main`.

## Start here

```bash
git checkout wip/sections-v3
git apply wip/remaining.patch   # schema.ts, Icon.tsx, SchemaForm.tsx, admin tenants/[slug]/page.tsx
git rm -r --cached wip && rm -rf wip   # after applying; don't merge this folder
npm install && npx tsc --noEmit   # only error left: TenantPage render map lacks reviews/services
```

## What the user asked for (Oct 6) and the decisions made with them

1. **Pop-up announcement** after page load: title, description, optional image, optional YouTube video (plays inline), optional CTA, close button.
   - Decided: closing is remembered in localStorage per device; it shows again after `remindAfterHours` (default 5, 0 = every visit), or right away if the content changes (the storage key includes a hash of the pop-up content).
   - It has an optional **end date** (`endsAt`), after which it hides automatically.
   - Layout: a **bottom sheet on phones** (no backdrop blocking the page, to avoid Google's intrusive-interstitial penalty), and a centered card with a backdrop on tablet and desktop. Default delay is 2 s.
2. **Exam red line** (`exams.announcement`): gets an end date `exams.announcementEnds` and hides automatically after it.
3. **YouTube section social stats**: reuse the **existing global `socials` list** (user chose this). Each link gets optional `followers` ("5000+") and `note` (a one-liner).
   - The YouTube section gets `showSocials` (default true), `followTitle`, `followIntro`, `stats[] {value,label}` (e.g. "5000+ متابع على كل المنصات") and `followLabel` (default "تابع").
   - Render the links as cards (icon, label, followers, note, follow button).
4. **Teacher login bug: FIXED, tested.** The causes were:
   - The teacher tried the platform console `/admin`, which only accepts the super admin. They're now 307-redirected to `/t/<slug>/admin`.
   - Phones capitalize the username. It's now matched lowercased and trimmed, and the password is trimmed.
   - `www.` wasn't added as a domain. It now falls back to the bare domain (and vice versa).
   - The basic-auth realm is now constant, so the browser reuses the login.
   - The console now shows the exact login URLs to send to the teacher.
5. **Book**: the cover and inside pages are combined into a book-like component (`BookStack`). The cover is in front with up to 3 pages behind it; hovering fans them a little, a tap fans them more, and tapping a page/cover while open opens the `Lightbox` (prev/next/swipe through cover + all pages). `pagesTitle` is the caption under it. With no pages, the old cover is shown.
6. **Reviews section** (`reviews`, new SectionKey): title, intro, `metric {value,label}`, `stars` (default true), and `images[]` shown as a masonry wall (4/3/2 columns). Long walls are cut with a fade and a `moreLabel` button; any image opens the Lightbox.
7. **Other services section** (`services`, new SectionKey): `items[]` with title, text, optional image, an optional **`Action` CTA**, and optional `socials[]` below the CTA.
   - The `Action` CTA type is `whatsapp` (any number, empty = the site number) | `telegram` | `messenger` | `phone` | `link`.
   - Layout: 1 item = wide horizontal card; 2+ items = grid (1 column on phones).
8. **Developer credit**: fixed in code (`src/lib/platform.ts`, the user chose "fixed on every site", so teachers can't edit it). It's a minimal, neutral strip under the footer, `dir="ltr"`, reading "Developed by Ahmed Badra · ahmedbadra29@gmail.com · [WhatsApp +20 115 866 7913]", with an Arabic pre-filled message. It must not look like teacher content.
9. Everything must look good on **phone (390), tablet (820), desktop (1280)**.

## Done (on this branch)

- `src/lib/dates.ts`: Cairo-time helpers `endOfDay`, `deadline`, `isOver`, `DATE_RE` (tested, including DST).
- `src/lib/action.ts` + `components/ActionButton.tsx`: the configurable CTA.
- `src/lib/platform.ts`: developer info.
- `components/`:
  - `Lightbox` (viewer with prev/next/swipe/keys, RTL-aware), `PhotoViewer` (now uses Lightbox), `HideAfter` (client-side end-date guard).
  - `Popup`, `BookStack`, `Book` (uses BookStack), `Reviews`, `Services`, `DevCredit`.
  - `YoutubeVideo` gained a `bare` prop.
- `content-utils.ts`: `withLiveContent` replaces `withUpcomingExams`. It drops past exams (now Cairo end-of-day), the red line after `announcementEnds`, and the pop-up if disabled or past `endsAt`. `site.ts` uses it.
- Login fixes in `server/auth.ts`, `server/site.ts`, `proxy.ts` (tested with curl against a local Postgres: all cases pass, a wrong password is still 401, and a teacher is refused on another teacher's admin).
- In `wip/remaining.patch`:
  - Schema: `Action`, `DateField` (`meta({widget:"date"})`), `Popup`, `Reviews`, `Services`, the new socials fields, the YouTube follow fields, `announcementEnds`, and SectionKey `reviews` and `services`.
  - New icons: phone, link, close, arrow, quote.
  - SchemaForm renders `widget: "date"` as a date picker.
  - The console shows the login URLs.

## Still to do

1. **`components/TenantPage.tsx`**:
   - Add `reviews: () => <Reviews data={c.reviews!} />` and `services: () => <Services data={c.services!} chat={chat} />` to the render map.
   - Wrap `<Announcement>` in `<HideAfter until={c.exams.announcementEnds}>`.
   - Render `<Popup data={c.popup} chat={chat} storageKey={`popup:${c.slug}:${hash(JSON.stringify(c.popup))}`} closeLabel="إغلاق" />` when `c.popup` is set. Use a small djb2 hash computed on the server.
   - Pass `c.socials` to `<Youtube>`.
2. **`components/Youtube.tsx`**: add the follow block (stats row and social cards) after the subscribe card when `data.showSocials && socials.length`.
3. **`components/Footer.tsx`**: render `<DevCredit siteName={c.profile.fullTitle} />` after `</footer>` (it's in normal flow; `.site` already has `padding-bottom` for the sticky bar).
4. **CSS** (append to `src/app/sections.css`, using the existing tokens `--surface --raised --line --accent --accent-hot --muted --subtle --r-card --r-pill`). Classes needed:
   - `.pop-layer .pop .pop-grip .pop-close .pop-media .pop-img .pop-body`: card centered ≥641px with a backdrop; ≤640px a bottom sheet with `pointer-events:none` on the layer, `max-height:72vh`, a slide-up animation and safe-area padding; z-index above `.sticky` (30).
   - `.viewer-nav.prev/.next` and `.viewer-count`. `.viewer`/`.viewer-close` already exist; the close is now an icon, so size its svg.
   - `.bookstack-stage` (`overflow: clip`, padding), `.bookstack` (width ~260px, `aspect-ratio: 520/735`), `.sheet`, `.page` and `.cover`.
     - Pages use `--i`. Fan toward the inline end: `--dir:-1` in RTL, `1` in `[dir=ltr]`. Closed: small peek offsets. `:hover`: ~22px per page. `.open`: ~45px per page plus rotation, and the cover nudges the other way.
     - Also style `.spine` and `.bookstack-cap`.
   - `.rv-head .rv-metric .rv-stars .rv-wall(.cut/.open) .rv .rv-more`: masonry via `column-count` 4/3/2; `.cut` gets `max-height` and a mask fade.
   - `.svc-grid(.single) .svc .svc-img .svc-body`.
   - `.follow .follow-head .follow-stats .follow-grid .fcard` (brand-tinted icon chip per platform).
   - `.devcredit .dev-wa`: small, neutral and muted, separate from the theme accent.
5. **Admin**:
   - `src/lib/admin/sections.ts`: add pages `popup` ("الإعلان المنبثق", keys `["popup"]`), `reviews` ("آراء الطلاب"), `services` ("خدمات أخرى").
   - `src/lib/admin/labels.ts`: Arabic labels and hints for every new field (`enabled, video, endsAt, delaySeconds, remindAfterHours, to, followers, note, showSocials, followTitle, followIntro, followLabel, metric, stars, images, moreLabel, announcementEnds`). Use path labels for `*.cta.type` ("نوع الزر"); ENUMS: `phone: "اتصال"`, `link: "رابط"`, `reviews: "آراء الطلاب"`, `services: "خدمات أخرى"`.
6. **Test** (production build + local Postgres + Playwright, as in the previous PRs):
   - Fill every new section through the real admin forms.
   - Check the pop-up timing, close, remember and expiry; the red line expiry; the book fan and viewer; reviews show-more; the service CTA hrefs for each type; and the dev credit.
   - Look at 390/820/1280 screenshots and confirm no horizontal overflow.
   - Confirm an old-format DB row (without the new fields) still renders. `getTenant` fills defaults via `withDefaults`.
7. Open the PR. Tell the user that the new sections only appear after they add `reviews`/`services` to the section order (admin → ترتيب الأقسام), and the pop-up after filling its admin page.

Pending on the user's side: delete `.github/workflows/deploy.yml` on `main` (the old Pages workflow; the connector lacks the workflow scope).
