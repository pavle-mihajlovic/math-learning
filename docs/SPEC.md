# Spec sheet (v2, after round-2 answers)

## 1. Product in one sentence
A private, Duolingo-style web app that walks you through every section of real textbooks, strictly in order. It starts with OpenStax Calculus I–III, then linear algebra, proofs, Spivak, Abbott and Rudin. Each section gives you a required reading first, then all of its exercises with auto-checked typed answers. It runs on iPhone, Windows and Linux, and syncs between them.

## 2. Decisions log

| # | Decision | Source |
|---|---|---|
| D1 | Web app (PWA): iPhone home screen, plus any browser on Windows/Linux. No App Store. | R1 |
| D2 | Typed answers, auto-checked. No handwriting or scanning. | R1 |
| D3 | Content is produced in chats and stored as JSON in this repo. No API bill. | R1 |
| D4 | Solution labels: 📗 book > ✅ AI verified by math software (SymPy) > 🤖 AI. Book solutions are preferred. | R1 |
| D5 | **Stage 1 = OpenStax Calculus Vol 1–3, imported from its CC-BY source files** (110 sections, about 6,300 exercises, about 3,100 with book answers). No PDFs or OCR needed. | R2 + research |
| D6 | Review everything: **every section, every exercise**, strictly in book order. | R1, R2 |
| D7 | $0 hosting: Cloudflare Pages, plus a Worker and a D1 database for sync. | R1 |
| D8 | Claude writes all the code; each roadmap task is one chat. | R1 |
| D9 | Private repo. Content from your own copies of commercial books stays behind login. | R1 |
| D10 | **Two answer input modes** (plain text + preview, and a visual equation editor), switchable at any time. You'll pick one after trying both. | R2 |
| D11 | **Strict sequence**, one track at a time. Spaced-repetition reviews of missed problems are mixed into the flow. | R2 |
| D12 | **No daily quota.** You go at your own pace. | R2 |
| D13 | Wrong answer → 1 retry → prewritten hint → step-by-step solution. | R2 |
| D14 | Missed problems come back as **variants with new numbers**. | R2 |
| D15 | **Required reading before each unit**, adapted from the textbook section (OpenStax is CC-BY, so its text can be adapted with attribution). | R2 |
| D16 | Optional proof cards for theorems, even during calculus. | R2 |
| D17 | After linear algebra and proofs: **Spivak, every chapter**, then Abbott (you own it), then Rudin PMA, then Rudin RCA. | R2 |
| D18 | Login: **account tied to your email, plus a one-time QR code** to log in other devices. Single user forever. | R2 |
| D19 | **Always dark mode.** | R2 |
| D20 | **Duolingo-style motivation is a core feature**, not polish. | R2 |
| D21 | Hints are written in advance only. No live AI in the app. | R2 |

## 3. Hard requirements
1. Tap the icon and you're on the next card in under 2 s.
2. Works on iPhone Safari (home screen), Chrome, Edge and Firefox on Windows and Linux. Phone layout, plus desktop layout with keyboard shortcuts (Enter = check, Space = next, H = hint).
3. Answer checking runs in the browser and works offline.
4. Progress syncs automatically, with no conflicts (the attempt log is append-only).
5. Every exercise shows its source ("OpenStax Calc Vol 2 §3.1 #17") and its solution label.

## 4. The flow
```
Path map → next unit node
  1. Required reading  (5–15 short swipeable cards adapted from the section, with the book's
                        worked examples revealed step by step; "Got it" on each card)
  2. Chunks            (about 2 min each: 4–6 exercises from the section, in book order)
       type answer → Check → ✓ +XP / ✗ → retry → hint → solution → next
  3. Optional proof cards for the section's theorems
  4. Unit complete     → celebration, % updated, node fills on the map
Reviews: missed problems return as variants, mixed in between chunks.
```

### Exercises that can't be auto-checked
Some exercises ask you to sketch, explain or prove. These become **self-check** cards: you reveal the book or AI answer and tap ✓ or ✗. They count toward progress like any other exercise.

### Answer kinds
These are the same as v1: number, expression (with `+C`), equation, interval/set, vector/matrix, DNE/∞, multiple choice, multi-part. Two more:
- **self-check**, described above.
- **graph**: the app draws a function, and you answer a question about it.

## 5. Motivation and progress (D20)
- **Path map:** each book is a winding path. Chapters are banners and sections are nodes. A node's ring shows its % done, and the current node pulses.
- **Percentages everywhere:**
  - whole book (exercises done out of 6,316)
  - each chapter, as a bar
  - each unit, as a ring
  - each stage, out of 7
- **XP:** points for each correct answer, a combo bonus for runs of correct answers, and a bonus for a perfect chunk.
- **Streak:** any one finished chunk counts for the day. Streak freezes are earned with XP. The streak counter is shown big on the home screen.
- **Mastery:** each unit gets 0–5 crowns, based on how well its problems are remembered (from the spaced-repetition data).
- **Celebrations:**
  - confetti and sound after each chunk
  - a trophy screen when a chapter is done
  - a big screen when a book is done
- **Badges:** "First derivative", "100 integrals", "Series slayer", "Every exercise in Vol 1", and so on.
- **Stats:**
  - activity calendar heatmap
  - XP per week
  - accuracy by topic
  - a projected finish date at your recent pace
- **Personal league:** this week's XP against your own last 4 weeks, since you're the only user.
- **Not included:** hearts or lives. Being blocked from practising works against volume.
- Haptics: iPhone Safari doesn't support vibration, so sound and animation carry the feedback there.

## 6. Architecture
```
Importers (scripts/, run in chats)
  OpenStax source files (math markup) → LaTeX, figures, book answers → content/os-calc/V1.2.3.json
  (later: PDF/photo importer for Spivak, Abbott, Rudin)
Content chats (K-tasks): required reading, checkable answer formats, solutions for
  exercises without book answers, hints, variants, proof cards → validator + SymPy check
Static PWA on Cloudflare Pages: Svelte + Vite + TypeScript, KaTeX, math.js checker,
  MathLive (visual editor mode), ts-fsrs scheduler, IndexedDB, service worker
Cloudflare Worker + D1: email login (one-time code by email, through a free email API)
  + QR device pairing + attempt-log sync
```
- **Figures:** OpenStax diagrams are CC-BY and included. They're shown on a light rounded panel, or with inverted colors, so they're readable in dark mode.
- **Attribution:** a footer on each unit credits OpenStax (CC-BY 4.0).

## 7. Non-goals
A native app, multiple users, live AI in the app, hearts/lives, and daily quotas.
