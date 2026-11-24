# Roadmap

**How to use this:** every task fits in **one chat**. Open a new Claude Code session on this repo and paste:

> Do task **B03** from `docs/ROADMAP.md`.

The chat reads `docs/`, does the work, ticks the box, and opens a pull request. Tasks marked ⇉ can run in parallel chats. "Needs" lists the tasks that must be done first.

---

## Stage A: First exercise on your phone

- [ ] **B01 Scaffold.** Svelte + Vite + TS, KaTeX, always-dark theme, test runner, works in Chrome, Firefox, Edge and Safari. One hard-coded problem on screen.
- [ ] **B02 Content schema.** JSON Schema + TS types for book → chapter → unit → reading cards / exercises / proof cards (SPEC §4). Write `docs/CONTENT_GUIDE.md`, which every K-task chat follows. *Needs:* B01.
- [ ] **B03 OpenStax importer.** ⇉ `scripts/import_openstax.py`: source files → JSON for all 110 sections. Converts the math markup to LaTeX, copies figures, attaches book answers, marks each exercise as auto-checkable or self-check, and keeps worked examples for the readings. *Done when:* all 110 unit files exist and spot-checks render correctly. *Needs:* B02.
- [ ] **B04 Answer checker.** ⇉ `src/check/`: plain-text math parsing, random-point equivalence, `+C`, tolerance, intervals/sets, vectors/matrices, DNE/∞, multi-part. 150+ tests. *Needs:* B01.
- [ ] **B05 Validator.** `npm run validate`: schema, KaTeX renders, every stored answer passes the checker, plus `scripts/verify_sympy.py`. *Needs:* B02, B04.
- [ ] **B06 Input mode 1: plain text.** Live preview and a helper key row tuned for the iPhone keyboard. *Needs:* B01.
- [ ] **B07 Input mode 2: visual editor.** MathLive with its on-screen math keyboard, plus a settings toggle between modes 1 and 2. *Needs:* B06.
- [ ] **B08 Card screens.** Reading cards (swipe, "Got it"), exercise card (check → retry → hint → step-by-step solution), self-check card, source and solution labels, desktop keyboard shortcuts. *Needs:* B03, B04, B06.
- [ ] **B09 Deploy.** Cloudflare Pages from the private repo. The chat gives you about 5 minutes of click-by-click setup. *Done when:* it opens on your iPhone and Windows. *Needs:* B08.

**🎯 Milestone A: you can do OpenStax §1.1 on your phone, with both input modes to try out.**

## Stage B: Daily driver

- [ ] **B10 PWA + offline.** Manifest, icons, service worker, iOS "Add to Home Screen" install. Content downloads chapter by chapter. *Needs:* B09.
- [ ] **B11 Progress engine.** IndexedDB attempt log, strict-order "next card" logic, unit and chapter completion %, all-time problems-solved counter, active-time tracking (pauses when idle or in the background). *Needs:* B08.
- [ ] **B12 Account + sync.** Cloudflare Worker + D1, email one-time-code login, QR pairing for new devices, attempt-log sync, export/backup button. *Needs:* B11, B09.
- [ ] **B13 Practice mistakes.** Separate "Practice mistakes" button. Missed exercises come back on a spaced-repetition schedule (ts-fsrs) as variants with random parameters, and the answer is computed per variant. *Needs:* B04, B11.

**🎯 Milestone B: phone and computer in sync, works offline, separate mistakes practice.**

## Stage C: Progress views (serious and minimal)

- [ ] **B14 Home screen.** "Continue" button, % of Calc I–III complete, all-time problems solved, total time spent. *Needs:* B11.
- [ ] **B15 Course map.** Volumes → chapters → sections in table-of-contents layout, a % bar on each, ✓ on finished sections, tap a section for its stats or to redo it. *Needs:* B11.
- [ ] **B16 Stats screen.** Problems solved and time spent per day and week, first-try accuracy per chapter, pending mistakes count. *Needs:* B11.

**🎯 Milestone C: you can always see exactly where you are and how much you've done.**

## Stage D: Content for Calculus I–III (110 chats, ⇉ start any time after B05)

- [ ] **K-V1.1.1 … K-V3.7.4: one chat per section** (see [CURRICULUM.md](CURRICULUM.md)), following CONTENT_GUIDE:
  1. Write the required reading (adapted from the section, with its worked examples).
  2. Turn the book answers into checkable formats.
  3. Write ✅ solutions for exercises without book answers, verified with SymPy, and 🤖 only when verification is impossible.
  4. Add hints and variant templates.
  5. Add optional proof cards.
  6. Make sure the validator passes.

  Tick the unit in CURRICULUM.md when done. Stay at least one chapter ahead of where you're studying.

## Later: after calculus is set up (to be planned together)
Not scheduled yet. These are ideas we'll revisit once calculus is up and running:
- Linear algebra (Hefferon? Axler?)
- Proofs (Hammack?)
- Spivak, every chapter
- Abbott (you own it)
- Rudin *Principles of Mathematical Analysis* (PMA)
- Rudin *Real and Complex Analysis* (RCA)
- Proof card types
- A PDF/photo importer for books you own

## Suggested order
1. B01 → B02 → (B03 ⇉ B04 ⇉ B06) → B05 → B07 → B08 → B09: **Milestone A**.
2. Start K-V1.1.1, K-V1.1.2, … in parallel chats right away; keep 1–2 chapters ahead of yourself.
3. B10 → B11 → B12 → B13, then B14–B16.
