# Deploy (B09): Cloudflare Workers

The site is static: `npm run build` writes `dist/`, and Cloudflare Workers serves it as static assets (configured in `wrangler.jsonc`). Every push to `main` redeploys it automatically.

## One-time setup (already done)

1. Go to **dash.cloudflare.com** → **Compute (Workers) → Workers & Pages** → **Create** → **Import a repository**.
2. Connect GitHub and select **pavle-mihajlovic/math-learning**. Cloudflare only needs read access; the repo stays private.
3. Fill in **Set up your application**:
   - **Project name:** `road-to-rudin`
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Preview command:** `npx wrangler versions upload`
   - **Enable Preview builds:** on (pull requests get their own preview URL)
   - **Protect with Cloudflare Access:** optional, see below
   - **Advanced settings:** leave Path as `/` and the API token on "Create new token". Add the variable `NODE_VERSION` = `22`.
4. Click **Deploy**. The site appears at `https://road-to-rudin.<your-subdomain>.workers.dev`.

The production branch is the repo's default branch (`main`). To change it later, go to the project's **Settings → Builds**.

> The first deploy used the commands `npx wrangler deploy --assets=./dist --name=road-to-rudin --compatibility-date=2026-11-01` (and the same flags for `versions upload`), because `wrangler.jsonc` didn't exist yet. Both forms work. Now that the config file exists, the short commands above are enough, and you can simplify them in **Settings → Builds** if you like.

## Opening it on your devices

**iPhone**

1. Open the `workers.dev` URL in **Safari**. (Only Safari can add it to the Home Screen as an app.)
2. Tap **Share** (the square with an arrow) → **Add to Home Screen** → **Add**.
3. Open it from the new **Road to Rudin** icon. It runs full screen, without Safari's address bar.

Offline use comes with B10. Until then it needs a connection.

**Windows / Linux**

Open the URL in Chrome, Edge or Firefox, and bookmark it. Keyboard shortcuts: Enter = check, Space = next, H = hint, Y/N = self-check.

## Keeping it private until login exists (optional)

Until B12 adds login, anyone with the link can open the site. The URL isn't published anywhere and search engines are told not to index it. The calculus content is OpenStax (CC BY-NC-SA), so this is fine. To lock it anyway:

- In the project, open **Settings → Domains & Routes**. Next to the `workers.dev` route, enable **Cloudflare Access** (free for up to 50 users).
- Add an **Allow** policy for your email address. Opening the site then asks for a one-time code sent to that email.

## What gets deployed

- `dist/content/os-calc/*.json`: 110 units plus `index.json` (about 9 MB, loaded one unit at a time)
- `dist/figures/os-calc/*.webp`: about 1,550 figures (about 18 MB)
- `dist/mathlive/fonts`: fonts for the visual editor, served locally
- `public/_headers`: long cache lifetimes for hashed assets and figures; content JSON is always revalidated, so content PRs show up right away

Workers static assets allow 20,000 files and 25 MiB per file, far more than this needs.
