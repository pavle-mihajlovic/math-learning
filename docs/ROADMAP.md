# Roadmap: Calculus → Linear Algebra → Baby Rudin → Big Rudin

Two roadmaps run side by side:

- **A. The math**: what you study, in what order.
- **B. The build**: what gets built, in what order.

The rule for the build: **get one chapter fully working end to end before scaling to whole books.**

---

## A. Math roadmap

The goal decides the route. Rudin's *Principles of Mathematical Analysis* (PMA, "Baby Rudin") and *Real and Complex Analysis* (RCA, "Big Rudin") are terse and proof-only. The most common failure is jumping from computational calculus straight into PMA. So the route below has a **proof bridge** and an **analysis bridge** built in.

| Phase | Topic | Primary text (✅ = free/open license) | Problem sources | Exit test |
|---|---|---|---|---|
| 0 | Proof literacy: logic, sets, induction, functions, cardinality | Velleman *How to Prove It* / ✅ Hammack *Book of Proof* | Hammack (odd solutions included) | Write clean ε-free proofs: induction, contradiction, bijections |
| 1 | Single-variable calculus | ✅ OpenStax *Calculus Vol 1–2*, ✅ APEX Calculus, Stewart | OpenStax (answers to odd problems), Stewart + solution manual | Speed and accuracy on limits, derivatives, integrals, series |
| 2 | Multivariable calculus | ✅ OpenStax *Calculus Vol 3*, Stewart, ✅ Active Calculus Multivariable | Same | Partial derivatives, multiple integrals, Green/Stokes/divergence theorems |
| 3a | Computational linear algebra | Strang *Intro to LA*, ✅ Hefferon *Linear Algebra* | Hefferon (full answer manual is free), ✅ Beezer *FCLA* | Row reduction, eigenvalues, orthogonality, SVD, all by hand |
| 3b | Proof-based linear algebra | ✅ Axler *Linear Algebra Done Right* 4e (open access) | Axler exercises (community solutions exist) | Prove the spectral theorem yourself |
| 4 | Rigorous calculus (bridge) | Spivak *Calculus* **or** Abbott *Understanding Analysis* | Spivak has a full answer book | ε-δ proofs come naturally |
| 5 | **Baby Rudin** ch. 1–7 (then 8–11) | Rudin PMA | Rudin exercises, Bergman's supplement, community solution sets | Can do most chapter exercises without help |
| 6 | Topology and complex basics (small) | Munkres ch. 2–3 (selected), Needham *Visual Complex Analysis* or Stein–Shakarchi *Complex* | Selected | Comfortable with compactness, connectedness, holomorphic functions |
| 7 | **Big Rudin** RCA ch. 1–8 (measure, L^p, Hilbert spaces), then 10–16 (complex) | Rudin RCA, with Folland or Stein–Shakarchi *Real* alongside | RCA exercises | You understand real and complex analysis |

Notes:
- Phases 1–3a are mostly **relearning**, so they can go fast. Place out of units with diagnostic sets instead of grinding everything.
- 3b and 4 can run **in parallel** with 1–2 once Phase 0 is done.
- Free texts (✅) matter for the build too. Their licenses let you store and even share the extracted problems, so build the pipeline on them first.

---

## B. Build roadmap

Each milestone ends with something usable on your phone.

### M0: Decisions (now)
- Answer [QUESTIONS.md](QUESTIONS.md).
- Lock in the stack, the first book, and the core loop for a two-minute session.

### M1: Ingestion spike, one chapter, no app
- Pick one chapter (suggested: OpenStax Calc Vol 1, Ch 2 "Limits").
- PDF → page images → Claude vision → structured JSON (statement in LaTeX, answer, solution, figure crops).
- Match the exercises with the answer key in the back of the book.
- **Measure:** extraction accuracy (spot-check 50 problems), cost per page, time per page.
- Output: `content/openstax-calc1/ch02.json`, reviewed by hand.

### M2: Minimal PWA, the "two-minute loop"
- Installable web app (Add to Home Screen), opens straight to a problem.
- KaTeX rendering, a "reveal answer" button, and "show solution" in steps.
- Self-grade buttons: ✗ / ~ / ✓ (internally Again / Hard / Good).
- Login once (magic link). Progress syncs between phone and computer.
- Works offline and syncs later.

### M3: Spaced repetition and session design
- FSRS scheduler: each problem gets a review schedule, so missed problems come back.
- A daily queue that mixes new problems, reviews and interleaved older units.
- Unit mastery meter and a "can I skip this unit?" diagnostic.

### M4: Scale ingestion
- A batch pipeline over full books, plus a review screen on desktop to approve, fix or reject extracted problems.
- Deduplicate similar problems across books, and tag each one by skill (e.g. `integration.by-parts`).
- Add solution-manual PDFs as a second source, linked to the problems they solve.

### M5: Answer checking
- Numeric answers checked with a tolerance.
- Symbolic answers checked for equivalence (SymPy on the server, or a math-keyboard input).
- AI-generated worked solutions for problems that have only an answer, **verified by a CAS where possible** and flagged "AI-generated" otherwise.

### M6: AI tutor layer
- A hint ladder: nudge → key idea → first step → full solution.
- Photo of handwritten work → feedback on where it went wrong.
- "Explain why" follow-ups on any solution step.

### M7: Proof mode (for Spivak, Axler, Rudin)
- Proof flashcards: definitions, theorem statements, and "what's the key trick?" cards.
- Proof reorder puzzles (put shuffled proof lines in order) and fill-in-the-gap proofs, good for one-minute phone sessions.
- Full proof attempts on paper or a computer → AI critique against a rubric (rigor, gaps, quantifier errors).
- Counterexample drills: "Is this true? If not, give a counterexample."

### M8: Polish
- Streaks, a stats dashboard, a weekly report, and dark mode.
- "Continue on computer" handoff for long problems.

---

## Main risks

| Risk | Mitigation |
|---|---|
| OCR of math is error-prone (subscripts, matrices, figures) | Claude vision with page images plus a human review queue; start with clean, born-digital PDFs |
| Answer keys cover only odd problems | Generate solutions with AI, verify with a CAS, and label where each solution came from |
| Rudin has no official solutions | Community solution sets plus AI critique; accept that grading proofs is fuzzy |
| Copyright on commercial books | Keep the repo and app **private and single-user**; never commit PDFs or extracted text to a public place |
| The build eats the time meant for studying | M2 is usable within days; study from day one and build alongside |
