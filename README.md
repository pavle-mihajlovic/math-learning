# Road to Rudin

A private, minimal web app for working through every section and exercise of OpenStax Calculus I–III on phone or computer, on the way to Rudin. Other subjects come later.

**Status:** Stages A and B (B01–B13) are done: the app works offline as a Home Screen app, tracks progress in an attempt log, syncs between devices, and has Practice mistakes. All 110 sections are imported (6,316 exercises, 1,570 of them auto-checked so far). Chapter 1 (Functions and Graphs) has its exercises finished; the progress views (B14–B16) are done too. Its readings and the other chapters (K-tasks) are next.

- [docs/ROADMAP.md](docs/ROADMAP.md): math route and build milestones
- [docs/SPEC.md](docs/SPEC.md): product spec, architecture, data model, ingestion pipeline
- [docs/CURRICULUM.md](docs/CURRICULUM.md): all 110 OpenStax Calculus sections (later stages to be planned)
- [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md): content format and the rules every K-task chat follows
- [docs/DEPLOY.md](docs/DEPLOY.md): Cloudflare Workers setup
- [docs/QUESTIONS.md](docs/QUESTIONS.md): open decisions

To work on the project, open a Claude Code session on this repo and say: *"Do task B10 from docs/ROADMAP.md."* or *"Do task K-V1.1.1."*

## Develop

Needs Node 22.

```bash
npm install
```

```bash
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | dev server at http://localhost:5173 |
| `npm test` | unit tests (answer checker, inline format, variants, chunking) |
| `npm run check` | TypeScript + Svelte type check |
| `npm run validate` | content validator: schema, KaTeX, answers, figures (`-- --unit V1.2.3` for one unit) |
| `python3 scripts/verify_sympy.py` | SymPy check of ✅ solutions (needs `pip install sympy`) |
| `npm run build` | production build into `dist/` |
| `npm run import -- --src PATH` | re-import OpenStax source (see CONTENT_GUIDE §10; needs Pillow) |

## Layout

```
src/check/      answer checker: parser, evaluator, equivalence, sets/vectors/matrices, LaTeX preview
src/content/    content types, inline-text renderer, loaders, variant templates
src/input/      input mode 1 (plain text + preview + key row) and mode 2 (MathLive)
src/cards/      reading, try-it-first, exercise, self-check and proof cards; unit player
schema/         JSON Schema for unit files
scripts/        importer, validator, SymPy verifier
public/content/ imported units (os-calc/V1.2.3.json)
public/figures/ figures (WebP)
```

Content adapted from *Calculus* Volumes 1–3 by Gilbert Strang and Edwin “Jed” Herman, OpenStax, licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
