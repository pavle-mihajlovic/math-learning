# Deploy (B09, B12): Cloudflare Workers

The app is static: `npm run build` writes `dist/`, and Cloudflare Workers serves it as static assets (configured in `wrangler.jsonc`). Since B12, requests to `/api/*` run a small Worker (`worker/index.ts`) with a D1 database for login and sync. Every push to `main` redeploys automatically.

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

The Home Screen app works offline (B10). The chapter you're in and the next one download automatically as you open units; **Settings → Offline → Download everything** stores all of it (about 27 MB). iOS keeps a Home Screen app's storage; plain Safari tabs can lose theirs after a few weeks without a visit.

When a new version is deployed, the app shows **A new version is ready · Reload** at the bottom.

**Sync:** open **Settings → Account and sync** on each device. Sign in with the emailed code, or on a signed-in device tap **Link another device** and scan the QR code (or type its code into the other device's Settings). On iPhone, the Home Screen app keeps its own sign-in separate from Safari, so type the pairing code inside the Home Screen app.

**Windows / Linux**

Open the URL in Chrome, Edge or Firefox, and bookmark it. Keyboard shortcuts: Enter = check, Space = next, H = hint, Y/N = self-check.

## B12 sync setup (one-time)

Sync needs a D1 database, a free Resend account for the login emails, and two secrets. About 10 minutes. Until this is done the app still works; Settings just says sync isn't reachable.

> Do step 1 before merging the B12 pull request: `wrangler.jsonc` needs the database id, and a deploy without it fails (the previous version keeps running).

1. **Create the database.** In **dash.cloudflare.com** → **Storage & databases → D1 SQL database** → **Create database**. Name it `road-to-rudin` and click **Create**. Copy its **Database ID** and put it in `wrangler.jsonc` in place of `REPLACE_WITH_D1_DATABASE_ID` (or paste it into a Claude chat and ask it to do that).
2. **Create the tables.** Open the database → **Console**. Paste the whole of [`worker/migrations/0001_init.sql`](../worker/migrations/0001_init.sql) and click **Execute**. (Running it again is harmless.) Later schema changes come as new numbered files in `worker/migrations/`, applied the same way.
3. **Resend.** Sign up at **resend.com** with the email address you'll sign in with. Free accounts without their own domain can only send to that address, which is all this needs. Go to **API Keys → Create API key** (permission: Sending access) and copy the key.
4. **Secrets.** In Cloudflare, open **Workers & Pages → road-to-rudin → Settings → Variables and Secrets** and add two entries, both of type **Secret**:
   - `OWNER_EMAIL`: your email address (the only one that can sign in)
   - `RESEND_API_KEY`: the key from step 3

   Optional: `MAIL_FROM` if you verify your own domain in Resend (default `Road to Rudin <onboarding@resend.dev>`).
5. **Deploy** (merge the pull request, or **Deployments → Retry** on the latest build). Then open the app → **Settings → Account and sync** → **Email me a code**.

From a computer with Node, steps 1–2 and 4 also work from the terminal:

```bash
npx wrangler d1 create road-to-rudin
```

```bash
npx wrangler d1 migrations apply road-to-rudin --remote
```

```bash
npx wrangler secret put OWNER_EMAIL
```

```bash
npx wrangler secret put RESEND_API_KEY
```

### Security notes

- Only `OWNER_EMAIL` can sign in. The code request answers the same for any address and is limited to 5 emails an hour; a code works once, for 10 minutes, and locks after 5 wrong tries.
- Pairing codes are single use, expire after 10 minutes, and redeeming is limited to 20 tries an hour.
- Sessions are random tokens in an HttpOnly, Secure, SameSite=Strict cookie on `/api`; D1 stores only their SHA-256. **Settings → Sign out everywhere** revokes every device.

## Keeping the site private (optional)

The calculus content is OpenStax (CC BY-NC-SA), so the site itself is open to anyone with the link; login only guards your progress. The URL isn't published anywhere and search engines are told not to index it. To lock the whole site anyway:

- In the project, open **Settings → Domains & Routes**. Next to the `workers.dev` route, enable **Cloudflare Access** (free for up to 50 users).
- Add an **Allow** policy for your email address. Opening the site then asks for a one-time code sent to that email.

Access sessions expire (24 hours by default), and the offline app can't renew one without a connection, so this works best with a long session duration.

## What gets deployed

- `dist/content/os-calc/*.json`: 110 units plus `index.json` (about 9 MB, loaded one unit at a time)
- `dist/figures/os-calc/*.webp`: about 1,550 figures (about 18 MB)
- `dist/mathlive/fonts`: fonts for the visual editor, served locally
- `public/_headers`: long cache lifetimes for hashed assets and figures; content JSON, `index.html` and `sw.js` are always revalidated
- `dist/sw.js`: the service worker, generated at build time with the list of app-shell files to precache. Content updates (K-task PRs) show up the second time you open a unit: the first open answers from the offline copy and refreshes it in the background
- `worker/`: the `/api` Worker and D1 migrations (B12)

Workers static assets allow 20,000 files and 25 MiB per file, far more than this needs.
