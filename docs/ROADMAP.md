# Roadmap

**How to use this:** every task below fits in **one chat**. Open a new Claude Code session on this repo and paste:

> Do task **B04** from `docs/ROADMAP.md`.

The chat reads the docs, does the work, ticks the box here, and opens a pull request. Tasks are in dependency order. Within a section, tasks marked ⇉ can run in parallel.

Each task lists what it needs (**needs**) and what counts as finished (**done when**).

---

## Stage 1: Foundations (make the first problem appear on your phone)

- [ ] **B01 Scaffold.** Svelte + Vite + TS app, KaTeX rendering, one hard-coded problem on screen, `npm run dev` / `build` / `test` all work. *Done when:* builds locally, unit-test runner set up.
- [ ] **B02 Content schema + guide.** JSON Schema + TS types for units, chunks, lesson cards and problems (per SPEC §5); write `docs/CONTENT_GUIDE.md` (the instructions every content chat follows); hand-write a sample unit `content/C1/C101.json` with 2 chunks and 10 problems. *Needs:* B01.
- [ ] **B03 Answer checker.** ⇉ `src/check/`: parse plain-text math (math.js), random-point equivalence, `+C`, tolerance, intervals/sets, vectors/matrices, DNE/∞, multi-part. 100+ unit tests. *Needs:* B01.
- [ ] **B04 Validator script.** ⇉ `npm run validate`: schema check, every LaTeX string renders in KaTeX, every stored answer is accepted by the checker, IDs unique, plus a Python `scripts/verify_sympy.py` that re-derives computational answers where possible. *Needs:* B02, B03.
- [ ] **B05 Math input.** Text box with live KaTeX preview and an iPhone helper key row (`^ ( ) / √ π e sin cos ln ∞ ,`), large tap targets, no auto-capitalize or autocorrect. *Needs:* B01.
- [ ] **B06 Card screen.** Lesson card and problem card flow: check → ✓/✗ feedback → retry → hint → step-by-step solution → next. Shows source and solution label. *Needs:* B02, B03, B05.
- [ ] **B07 Deploy.** Cloudflare Pages from the private repo. The chat gives you click-by-click steps for the account; you do about 5 minutes of clicking once. *Done when:* the URL opens on your iPhone. *Needs:* B06.

**🎯 Milestone 1: you can practice C101 on your phone.**

## Stage 2: Daily habit (offline, memory, sync)

- [ ] **B08 PWA/offline.** Manifest, icons, service worker caching app and content; test "Add to Home Screen" on iOS. *Needs:* B07.
- [ ] **B09 Local progress + scheduler.** IndexedDB attempt log; ts-fsrs scheduling; daily queue = due reviews + new chunks in curriculum order (2 tracks interleaved). *Needs:* B06.
- [ ] **B10 Sync.** Cloudflare Worker + D1, sync-code auth, append-only log push/pull, QR code to pair a second device. *Needs:* B09, B07.
- [ ] **B11 Course map.** Tracks → units → chunks with progress bars; "Continue" button; jump to any unit; settings (daily new-chunk count). *Needs:* B09.

**🎯 Milestone 2: daily use on phone and computer with zero setup.**

## Stage 3: Content engine (run many times)

- [ ] **K-xxx Generate unit xxx.** ⇉ One chat per unit in [CURRICULUM.md](CURRICULUM.md), following `CONTENT_GUIDE.md`: concept cards, worked examples, 40–60 problems, hints, step-by-step solutions, SymPy-verified answers, validator passes. Prefer problems/solutions taken from the free textbooks (labeled `book`) where the chat can fetch them. *Needs:* B04. **About 110 chats in total, and you can start them right after B04, before the app is finished.**
- [ ] **B12 Variants.** Problem templates with random parameters (`{a}` in 2..9), so a missed problem returns with new numbers; the checker computes the answer per variant. *Needs:* B03, B06.
- [ ] **B13 Placement quick-check.** Optional 5-question check at the start of a unit. If you ace it, the unit's chunks are compressed (fewer problems, still reviewed). *Needs:* B09.
- [ ] **B14 Book ingestion pipeline.** For PDFs you provide: PDF → page images → extracted exercises + answer key → unit JSON, with a review step. Test on one chapter. *Needs:* B04. Then one chat per chapter (**I-xxx** tasks).

## Stage 4: Toward Rudin

- [ ] **B15 Proof card types.** Reorder-the-proof, fill-the-gap, true/false + counterexample, definition recall. *Needs:* B06.
- [ ] **B16 Proof critique (optional, needs API key).** Type a proof on your computer → AI critique against a rubric. Labeled AI. *Needs:* B10.
- [ ] **U-xxx Break down a book chapter into units** (Abbott / Rudin PMA / RCA), one chat per chapter; then **K-** tasks generate them.

## Stage 5: Nice-to-haves
- [ ] **B17** Streak + stats screen.
- [ ] **B18** Push reminders (iOS 16.4+ home-screen apps).
- [ ] **B19** Optional AI hint button (live, pay-per-use).
- [ ] **B20** Photo of paper work → AI feedback (optional, for long problems).

---

## Suggested order for the first two weeks
1. B01 → B02 → (B03 ⇉ B05) → B04 → B06 → B07: **first problem on your phone**.
2. Start K-A01…K-A04 and K-C101…K-C110 in parallel chats while B08–B11 are built.
3. Study daily from Milestone 1 onward; content stays ahead of you.
