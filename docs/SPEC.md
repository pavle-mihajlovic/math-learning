# Road to Rudin: spec sheet (v3, after round-3 answers)

## 1. Product in one sentence
**Road to Rudin** is a private, minimal web app that walks you through every section of OpenStax Calculus I–III, strictly in order. Each section gives you a required reading first, then all of its exercises with auto-checked typed answers. It shows clear progress (%, total problems solved, time spent), runs on iPhone, Windows and Linux, and syncs between them.

**Scope for now: calculus only.** Linear algebra, proofs, Spivak, Abbott and Rudin come after we revisit the plan (see ROADMAP "Later").

## 2. Decisions log

| # | Decision | Source |
|---|---|---|
| D1 | Web app (PWA): iPhone home screen, plus any browser on Windows/Linux. No App Store. | R1 |
| D2 | Typed answers, auto-checked. No handwriting or scanning. | R1 |
| D3 | Content is produced in chats and stored as JSON in this repo. No API bill. | R1 |
| D4 | Solution labels: 📗 book > ✅ AI verified by math software (SymPy) > 🤖 AI. Book solutions are preferred. | R1 |
| D5 | **Stage 1 = OpenStax Calculus Vol 1–3, imported from its CC BY-NC-SA 4.0 source files** (110 sections, about 6,300 exercises, about 3,100 with book answers). No PDFs or OCR needed. | R2 + research |
| D6 | Review everything: **every section, every exercise**, strictly in book order. | R1, R2 |
| D7 | $0 hosting: Cloudflare Pages, plus a Worker and a D1 database for sync. | R1 |
| D8 | Claude writes all the code; each roadmap task is one chat. | R1 |
| D9 | Private repo. Content from your own copies of commercial books stays behind login. | R1 |
| D10 | **Two answer input modes** (plain text + preview, and a visual equation editor), switchable at any time. You'll pick one after trying both. | R2 |
| D11 | **Strict sequence**, one track at a time. Spaced-repetition reviews of missed problems are mixed into the flow. | R2 |
| D12 | **No daily quota.** You go at your own pace. | R2 |
| D13 | Wrong answer → 1 retry → prewritten hint → step-by-step solution. | R2 |
| D14 | Missed problems come back as **variants with new numbers**. | R2 |
| D15 | **Required reading before each unit**, adapted from the textbook section (OpenStax Calculus is CC BY-NC-SA 4.0, so its text can be adapted with attribution for this non-commercial app, and adaptations stay under the same license). | R2 |
| D16 | Optional proof cards for theorems, even during calculus. | R2 |
| D17 | Later stages (linear algebra, proofs, Spivak, Abbott, Rudin PMA, Rudin RCA) are **deferred**. We set up calculus first and plan the rest afterwards. | R3 |
| D18 | Login: **account tied to your email, plus a one-time QR code** to log in other devices. Single user forever. | R2 |
| D19 | **Always dark mode.** | R2 |
| D20 | **Serious and minimal, not a game.** Progress is the point: % complete, total problems solved all-time, and time spent. No XP, sounds, confetti or badges. | R3 |
| D21 | Hints are written in advance only. No live AI in the app. | R2 |
| D22 | Required readings cover **close to the full section**. | R3 |
| D23 | The book's worked examples become **"try it first" problems**, with the book's solution as the answer. | R3 |
| D24 | Missed-problem reviews live behind a **separate "Practice mistakes" button**; they aren't mixed into the main flow. | R3 |
| D25 | Login codes are sent through a free **Resend** email account. | R3 |
| D26 | The app is called **Road to Rudin**. | R3 |

## 3. Hard requirements
1. Tap the icon and you're on the next card in under 2 s.
2. Works on iPhone Safari (home screen), Chrome, Edge and Firefox on Windows and Linux. Phone layout, plus desktop layout with keyboard shortcuts (Enter = check, Space = next, H = hint).
3. Answer checking runs in the browser and works offline.
4. Progress syncs automatically, with no conflicts (the attempt log is append-only).
5. Every exercise shows its source ("OpenStax Calc Vol 2 §3.1 #17") and its solution label.

## 4. The flow
```
Home → "Continue" (next card in strict book order)
  1. Required reading  (swipeable cards covering close to the full section; each of the book's
                        worked examples is a "try it first" card: attempt it → see the book's solution)
  2. Chunks            (about 2 min each: 4–6 exercises from the section, in book order)
       type answer → Check → ✓ / ✗ → retry → hint → solution → next
  3. Optional proof cards for the section's theorems
  4. Unit complete     → % updated, unit marked done on the course map
"Practice mistakes" button: missed problems return there as variants with new numbers, on a
spaced-repetition schedule. Separate from the main flow.
```

### Exercises that can't be auto-checked
Some exercises ask you to sketch, explain or prove. These become **self-check** cards: you reveal the book or AI answer and tap ✓ or ✗. They count toward progress like any other exercise.

### Answer kinds
These are the same as v1: number, expression (with `+C`), equation, interval/set, vector/matrix, DNE/∞, multiple choice, multi-part. Two more:
- **self-check**, described above.
- **graph**: the app draws a function, and you answer a question about it.

## 5. Progress (D20): serious and minimal
- **Home screen:** a "Continue" button, plus three numbers:
  - **% of Calculus I–III complete**
  - **total problems solved, all-time**
  - **total time spent**
- **Course map:** volumes → chapters → sections, laid out like the book's table of contents.
  - a % bar for each chapter and section
  - a ✓ mark on finished sections
  - tap any section to see its stats or redo it
- **Stats screen:**
  - problems solved and time spent, per day and per week
  - first-try accuracy per chapter
  - mistakes still pending
- **Time tracking:** the app counts active time only. It pauses after 60 s with no interaction, or when the app is in the background.
- **Not included:** XP, streak pressure, sounds, confetti, badges, hearts.

## 6. Architecture
```
Importers (scripts/, run in chats)
  OpenStax source files (math markup) → LaTeX, figures, book answers → public/content/os-calc/V1.2.3.json
  (later: PDF/photo importer for Spivak, Abbott, Rudin)
Content chats (K-tasks): required reading, checkable answer formats, solutions for
  exercises without book answers, hints, variants, proof cards → validator + SymPy check
Static PWA on Cloudflare Workers static assets: Svelte + Vite + TypeScript, KaTeX, own answer checker (src/check),
  MathLive (visual editor mode), ts-fsrs scheduler, IndexedDB, service worker
Cloudflare Worker + D1: email login (one-time code by email, through a free email API)
  + QR device pairing + attempt-log sync
```

### Attempt log and sync (B11–B13)
- Every finished card is an **event** (`src/progress/events.ts`): `read`, `ex` (main flow), `review` (Practice mistakes), `time` (active time), `set` (a synced setting). Events are append-only and have random ids.
- Everything shown is **derived** from the log (`src/progress/derive.ts`): a unit's % = (reading cards read + exercises finished, right or wrong) ÷ (reading cards + exercises); proof cards don't count. "Continue" opens the first unfinished unit in book order, at its first unread card or unfinished exercise. **Problems solved** counts every exercise finished correctly, in the main flow or in practice, redos included.
- **Practice mistakes** (`src/practice/queue.ts`): an exercise enters the queue when you miss it in the main flow (wrong, or you needed the solution of an auto-checked exercise). Practice results feed FSRS (ts-fsrs, no fuzz, so every device computes the same schedule): first-try right = Good, right after retries = Hard, wrong or needed the solution = Again. A miss in a redo also counts as Again. Each review draws new numbers from the exercise's `variant` with a seed from the exercise and review count; without a variant the original exercise comes back.
- **Sync**: the device pushes events the server hasn't acknowledged and pulls everything after its cursor. The server stores events with `INSERT OR IGNORE` by id, so there are no conflicts. The newest `set` event per key wins.
- **Login**: one account (the `OWNER_EMAIL` secret). A 6-digit code is emailed through Resend (10 minutes, 5 tries). A signed-in device can show a QR pairing code (single use, 10 minutes) for another device. Sessions are random tokens in an HttpOnly, SameSite=Strict cookie; the database stores only their SHA-256.
- The app works fully without signing in; the account only adds sync. Settings has an export/restore of the whole log as a JSON file.
- **Figures:** OpenStax diagrams (CC BY-NC-SA) are included as resized WebP files. They are shown on a light rounded panel, so they're readable in dark mode.
- **Attribution:** a footer on each unit credits OpenStax (CC BY-NC-SA 4.0) and links the original section.

## 7. Non-goals
A native app, multiple users, live AI in the app, game mechanics, sounds, and daily quotas.
