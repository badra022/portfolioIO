import "server-only";

/**
 * How-to text for agents, read on demand (the get_guide tool, MCP resources and the
 * ready-made prompts) instead of being loaded into every conversation.
 */
export const GUIDES = {
  onboarding: `New teacher, start to finish:
1. get_schema (no arguments) for the outline of a page; get_schema with part ("hero", "schedule"…) for exact fields; get_example with key to see one real section.
2. Gather the facts from the user: name, subjects and grades, schedule (days, times, areas/centers), WhatsApp number, book, exams, socials, YouTube. Never invent facts (prices, phone numbers, results, follower counts, dates): ask, or leave the optional field out.
3. Photos: see get_guide "images". Then list_images and view_image to decide which photo goes where. Image fields take the returned key (e.g. "uploads/…-teacher.webp").
4. create_teacher with the full content (and optionally a theme), or with copy_from and then edit_content to replace everything that belongs to the other teacher (all text, numbers, images, links).
5. A new teacher's plan has no paid bundles: turn on what the user bought with manage_plan before saving forms, quizzes, votes, offers or articles to the live site.
6. Send the user preview_url; adjust with edit_content (small changes) or update_content (whole sections).
7. When ready: manage_domain (the domain must also be added in Vercel → Settings → Domains), then manage_login to create the teacher's account (the password is shown once; pass it to the user).`,

  editing: `Editing a page:
- Read small: get_teacher gives a summary (sections, list sizes, item ids). Fetch what you will change with keys (["schedule"]) or path ("schedule.slots[id=S3A]").
- Change small: edit_content with paths. Pick list items by their own id, not their position: schedule.slots[id=S3A].time, quizzes[path=chem-exam].title, forms[id=book].fields. Positions also work: hero.headline.0, bar.items[0].
- Ops: set (replace or create; "list.-" appends), merge (change some fields of an object, keep the rest), upsert (add an item to a list, or replace the one with the same id/path), append, insert (at a position), remove.
- Not sure? Pass dry_run: true first: nothing is saved and you get the list of what would change.
- update_content replaces whole top-level keys; use it for a section you rewrite completely.
- "sections" is the page order, and every listed section needs its data. WhatsApp numbers are international digits only (2010…). Messages may use the placeholders listed in a field's description ({grade}, {date}…). Match the tone and language of the page (Egyptian Arabic) unless told otherwise.
- Every save keeps a version for 7 days (list_revisions, restore_revision).`,

  preview: `Preview and live site: every teacher has a private preview copy at <site>/preview (behind the admin login). update_content, edit_content and update_theme save to the preview by default, and their reply says live: false. Send the user preview_url, and only when they approve call publish_preview (everything in the preview goes live at once) or discard. Pass target "production" only when the user asks to change the live site directly; that also applies the change to the preview copy. get_teacher reads production by default, or the preview with env "preview". Collected data is per environment too: list_requests, quiz_results and get_analytics take env (default production).`,

  images: `Images (JPG, PNG, WEBP, GIF, AVIF up to 20 MB; stored as WebP, scaled to 1600px):
- You have the files and can run commands (Claude Code, Cowork, or a chat with code execution where the user attached the photos): call create_upload_link and POST each file yourself to upload_url, one file per request: curl -F "file=@/path/photo1.jpg" "<upload_url>". The reply gives the file's key. A request can't be over 4 MB: resize a larger photo first (longest side about 2000px; the server scales to 1600px anyway). No user action needed.
- The image is on the internet: upload_image with source_url (Google Drive and Dropbox share links work).
- You can only see the picture in the chat and have no file and no way to run commands: you can't send its bytes. Give the user page_url from create_upload_link (they drop the photos there), then list_images.
- Then list_images / view_image, and put the key in the image field (hero photo, quizzes[].questions[].image, articles[].image…).`,

  forms: `Forms: any WhatsApp button can open a form instead (the student leaves name, phone… for the teacher). Define forms in content "forms" (get_schema part "forms"), then set "form": "<form id>" on the button (hero.primaryCta, navCta, sticky.cta, final.cta, students.cta, schedule.form, book.order.form, exams.items[].form, challenge.form, and cta.form in services/popup/featured/honors/faq). Fields with remember=true (name, phone) are asked once per device; the button's own details (challenge answer, chosen group, exam) are attached automatically. Submissions: list_requests, update_requests. Needs the plan's "forms" bundle.`,

  quizzes: `Quizzes (content "quizzes", get_schema part "quizzes"; needs the "exams" bundle): each has a page at /<path>, an optional form asked before starting, a timer, start/end dates, state (auto/open/closed) and questions (text and/or image, type choice or text, optional correct answers that students never see, points). Add or change one quiz with edit_content: {op:"upsert", path:"quizzes", value:{path:"chem-exam", …}}.
Results and grading:
1. quiz_results (view summary) for the numbers.
2. quiz_results view "needs_grading" lists finished attempts not yet approved, with only the written answers that have no answer key.
3. grade_quiz with grades: [{attempt, score, note}] grades many at once; approve true (default) publishes each grade so the student can look it up by name and phone. approve_all approves every finished attempt with its automatic score.
Never invent a grade: grade from the answers, and tell the user what rule you used.
Changing a quiz that is already live: the preview may hold other unfinished work, and publish_preview publishes all of it. get_teacher shows what the preview holds (unpublished_in_preview). To fix a live quiz right away, edit_content with target "production" and the quiz's path (quizzes[path=…]); the same change is copied to the preview by item id. Students who already started keep the questions they got and grades use the answer key by question number, so after changing questions re-check quiz_results before grading; to change a quiz that has results, prefer fixing wording or answer keys and keep the question order.`,

  exam_results: `Exam results typed by hand (paper exams): students look up their grade on the site (exams section → past exams' results, or /exams) with their name and phone. exam_results to read; manage_exam_results to create one exam's results, add rows ({name, phone, score, note?}; a student already there with the same phone and first name gets the new score), edit title/date/full mark, publish or delete. Never invent grades: only add what the user gives you (e.g. a pasted sheet).`,

  promo: `Promotion (needs the "promo" bundle): the red bar (content "bar") shows announcement messages above the menu, each with text, icon, a section or url to go to, and start/end dates; the first current message shows, and {date} is the featured upcoming exam's date. The popup (content "popup") opens once per visitor. The featured section (content "featured") lists offers.`,

  library: `Content library (needs the "library" bundle): articles (content "articles", page at /articles/<path>, list at /articles: cover image, blocks of paragraph/heading/image/video/file, optional cta, publishAt to schedule), learning games (content "games", page at /games/<path>, list at /games) and the exams page (/exams: every listed quiz in tabs open/soon/finished, center exams to book, published results to look up). Every article, game and quiz has group (the heading it's listed under), tags (searchable), listed (on the list page or not) and showViews; content "library.showViews" turns view counts off everywhere.
Making a game: write ONE self-contained HTML file (inline script and styles, images as data: URIs or https links; libraries only from cdnjs.cloudflare.com, cdn.jsdelivr.net or unpkg.com; no network calls, no cookies or localStorage: it runs in a sandboxed frame), playable by touch on a phone in a 4:3 frame, in the site's language, max 3 MB. upload_game stores it and returns a key; put it in games[].file, with games[].form to ask the student's details before playing and games[].cta for a button under it.`,
} as const;

export type GuideTopic = keyof typeof GUIDES;
export const GUIDE_TOPICS = Object.keys(GUIDES) as [GuideTopic, ...GuideTopic[]];

export const GUIDE_TITLES: Record<GuideTopic, string> = {
  onboarding: "New teacher onboarding",
  editing: "Editing a page",
  preview: "Preview and live site",
  images: "Uploading images",
  forms: "Forms and requests",
  quizzes: "Quizzes and grading",
  exam_results: "Exam results (paper exams)",
  promo: "Red bar, popup and offers",
  library: "Articles and games",
};

/** One-click workflows shown in the AI app (MCP prompts). `super`: only for the platform admin. */
export const PROMPTS: { name: string; title: string; description: string; args: { name: string; description: string; required?: boolean }[]; super?: boolean; text: (a: Record<string, string | undefined>) => string }[] = [
  {
    name: "onboard_teacher", title: "New teacher onboarding", super: true,
    description: "Build a new teacher's page from their details and photos, then hand over the preview.",
    args: [{ name: "name", description: "The teacher's name", required: true }, { name: "details", description: "Everything known: subjects, grades, schedule, WhatsApp, book, exams, socials" }],
    text: (a) => `Build a new teacher page for ${a.name}.${a.details ? `\n\nWhat we know:\n${a.details}` : ""}\n\nFollow these steps exactly:\n${GUIDES.onboarding}\n\n${GUIDES.images}\n\nAsk me for anything missing before creating the page. Finish by sending me the preview link and a short list of what still needs my input.`,
  },
  {
    name: "weekly_exam", title: "Weekly exam: create, share, grade",
    description: "Create an online quiz from questions, give the link to share, and grade the answers afterwards.",
    args: [{ name: "topic", description: "What the exam covers and for which grade", required: true }, { name: "questions", description: "The questions (pasted text), or how many to write" }],
    text: (a) => `Set up this week's online exam: ${a.topic}.${a.questions ? `\n\nQuestions:\n${a.questions}` : ""}\n\n${GUIDES.quizzes}\n\n${GUIDES.editing}\n\nSteps: (1) get_teacher to see the existing quizzes and forms; (2) show me the quiz you will add with dry_run before saving; (3) save to the preview and send me the preview link; (4) after I approve, publish and give me the quiz link to share; (5) when I ask for results, use quiz_results and grade with grade_quiz in one batch.`,
  },
  {
    name: "monthly_promo", title: "Monthly promo: red bar and offer",
    description: "Announce an offer or event with the red bar, the popup and the featured section.",
    args: [{ name: "offer", description: "What to promote, and until when", required: true }],
    text: (a) => `Promote this on the site: ${a.offer}.\n\n${GUIDES.promo}\n\n${GUIDES.preview}\n\nRead the current bar, popup and featured section first (get_teacher keys ["bar","popup","featured","sections"]), propose the wording in the page's own tone, save to the preview, and publish only after I approve. Set end dates so the promotion disappears by itself.`,
  },
  {
    name: "answer_requests", title: "Answer the requests inbox",
    description: "Go through new form requests, summarize them and mark the ones handled.",
    args: [],
    text: () => `Go through the new requests: list_requests with status "new". Give me a short table (name, phone, what they asked for, when), grouped by form. Draft a WhatsApp reply for each group in the teacher's tone. Mark a request "contacted" or "done" with update_requests only when I say it was handled.\n\n${GUIDES.forms}`,
  },
];
