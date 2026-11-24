/**
 * B12: the sync API. Single user: the account is whoever can read OWNER_EMAIL's inbox.
 *
 *   POST /api/auth/request   {email}         email a 6-digit code (always answers ok)
 *   POST /api/auth/verify    {email, code}   sign this device in (sets the session cookie)
 *   GET  /api/me                             {signedIn}
 *   POST /api/auth/logout                    sign this device out
 *   POST /api/auth/logout-all                sign every device out
 *   POST /api/pair/create                    (signed in) one-time pairing code for the QR screen
 *   POST /api/pair/redeem    {code}          sign a new device in with a pairing code
 *   POST /api/sync           {push, since}   upload new events, download events after `since`
 *
 * Sessions are random tokens in an HttpOnly, SameSite=Strict cookie; only their SHA-256 is stored.
 * POSTs must be JSON, which browsers can't send cross-site without a preflight.
 */
import { isEvent, type Event } from '../src/progress/events';
import type { D1Database, D1PreparedStatement } from './d1';

export interface Env {
  DB: D1Database;
  /** The one email address allowed to sign in (a secret, so it isn't in the repo). */
  OWNER_EMAIL?: string;
  /** Resend API key (secret). */
  RESEND_API_KEY?: string;
  /** Sender, e.g. "Road to Rudin <onboarding@resend.dev>". */
  MAIL_FROM?: string;
}

export type Mailer = (to: string, subject: string, text: string) => Promise<void>;

export interface Deps {
  now: () => number;
  mail: Mailer;
}

const COOKIE = 'rtr_session';
const CODE_TTL = 10 * 60_000;
const CODE_TRIES = 5;
const PAIR_TTL = 10 * 60_000;
const SESSION_MAX_AGE = 400 * 24 * 3600; // seconds; browsers cap cookies at 400 days
const PUSH_MAX = 500;
const PULL_MAX = 1000;
const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function resendMailer(env: Env): Mailer {
  return async (to, subject, text) => {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM || 'Road to Rudin <onboarding@resend.dev>', to: [to], subject, text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  };
}

// ---------- helpers ----------

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Uniform random integer in [0, n) without modulo bias. */
function randomInt(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const b = new Uint32Array(1);
  do crypto.getRandomValues(b);
  while (b[0] >= limit);
  return b[0] % n;
}

export function normalizePairCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function newPairCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += PAIR_ALPHABET[randomInt(PAIR_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

function sessionCookie(token: string, maxAge = SESSION_MAX_AGE): string {
  return `${COOKIE}=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function readCookie(req: Request): string | null {
  const header = req.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=') || null;
  }
  return null;
}

async function body<T>(req: Request): Promise<T> {
  if (!(req.headers.get('Content-Type') ?? '').startsWith('application/json')) throw new HttpError(415, 'JSON only');
  const len = Number(req.headers.get('Content-Length') ?? 0);
  if (len > 2_000_000) throw new HttpError(413, 'Too large');
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Bad JSON');
  }
}

/** Fixed-window rate limit. Throws 429 when `key` was used more than `max` times in `windowMs`. */
async function throttle(db: D1Database, key: string, max: number, windowMs: number, now: number): Promise<void> {
  const row = await db.prepare('SELECT count, window_start FROM throttle WHERE key = ?').bind(key).first<{ count: number; window_start: number }>();
  if (!row || now - row.window_start > windowMs) {
    await db.prepare('INSERT OR REPLACE INTO throttle (key, count, window_start) VALUES (?, 1, ?)').bind(key, now).run();
    return;
  }
  if (row.count >= max) throw new HttpError(429, 'Too many tries. Wait a while and try again.');
  await db.prepare('UPDATE throttle SET count = count + 1 WHERE key = ?').bind(key).run();
}

async function createSession(db: D1Database, now: number, label: string): Promise<string> {
  const token = randomToken();
  await db
    .prepare('INSERT INTO sessions (hash, created, last_seen, label) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), now, now, label.slice(0, 120))
    .run();
  return token;
}

async function currentSession(db: D1Database, req: Request, now: number): Promise<string | null> {
  const token = readCookie(req);
  if (!token) return null;
  const hash = await sha256(token);
  const row = await db.prepare('SELECT hash, last_seen FROM sessions WHERE hash = ?').bind(hash).first<{ hash: string; last_seen: number }>();
  if (!row) return null;
  if (now - row.last_seen > 3600_000) await db.prepare('UPDATE sessions SET last_seen = ? WHERE hash = ?').bind(now, hash).run();
  return hash;
}

const deviceLabel = (req: Request) => req.headers.get('User-Agent') ?? '';

// ---------- handlers ----------

async function requestCode(env: Env, req: Request, deps: Deps): Promise<Response> {
  const { email } = await body<{ email?: string }>(req);
  const now = deps.now();
  const addr = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(addr)) throw new HttpError(400, 'Enter an email address.');
  await throttle(env.DB, 'code-request', 5, 3600_000, now);
  const owner = (env.OWNER_EMAIL ?? '').trim().toLowerCase();
  // Answer the same way for any address, so the endpoint doesn't reveal the owner's email.
  if (owner && addr === owner) {
    const code = String(randomInt(1_000_000)).padStart(6, '0');
    await env.DB
      .prepare('INSERT OR REPLACE INTO login_codes (email, hash, expires, tries) VALUES (?, ?, ?, 0)')
      .bind(addr, await sha256(`${addr}:${code}`), now + CODE_TTL)
      .run();
    try {
      await deps.mail(
        addr,
        `Road to Rudin code: ${code}`,
        `Your Road to Rudin sign-in code is ${code}\n\nIt works once, for 10 minutes. If you didn't ask for it, ignore this email.`,
      );
    } catch (e) {
      console.error(e);
      throw new HttpError(502, 'Could not send the email. Check the RESEND_API_KEY secret.');
    }
  }
  return json({ ok: true });
}

async function verifyCode(env: Env, req: Request, deps: Deps): Promise<Response> {
  const { email, code } = await body<{ email?: string; code?: string }>(req);
  const now = deps.now();
  const addr = String(email ?? '').trim().toLowerCase();
  const digits = String(code ?? '').replace(/\D/g, '');
  const row = await env.DB.prepare('SELECT hash, expires, tries FROM login_codes WHERE email = ?').bind(addr).first<{ hash: string; expires: number; tries: number }>();
  if (!row || row.expires < now || row.tries >= CODE_TRIES) throw new HttpError(400, 'That code has expired. Ask for a new one.');
  if ((await sha256(`${addr}:${digits}`)) !== row.hash) {
    await env.DB.prepare('UPDATE login_codes SET tries = tries + 1 WHERE email = ?').bind(addr).run();
    throw new HttpError(400, 'Wrong code.');
  }
  await env.DB.prepare('DELETE FROM login_codes WHERE email = ?').bind(addr).run();
  const token = await createSession(env.DB, now, deviceLabel(req));
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token) });
}

async function createPairing(env: Env, deps: Deps): Promise<Response> {
  const now = deps.now();
  const code = newPairCode();
  await env.DB.prepare('DELETE FROM pairings WHERE expires < ?').bind(now).run();
  await env.DB.prepare('INSERT INTO pairings (hash, expires) VALUES (?, ?)').bind(await sha256(normalizePairCode(code)), now + PAIR_TTL).run();
  return json({ code, expires: now + PAIR_TTL });
}

async function redeemPairing(env: Env, req: Request, deps: Deps): Promise<Response> {
  const { code } = await body<{ code?: string }>(req);
  const now = deps.now();
  await throttle(env.DB, 'pair-redeem', 20, 3600_000, now);
  const hash = await sha256(normalizePairCode(String(code ?? '')));
  const row = await env.DB.prepare('SELECT expires FROM pairings WHERE hash = ?').bind(hash).first<{ expires: number }>();
  if (!row || row.expires < now) throw new HttpError(400, 'That pairing code has expired or was already used. Make a new one on your other device.');
  await env.DB.prepare('DELETE FROM pairings WHERE hash = ?').bind(hash).run();
  const token = await createSession(env.DB, now, deviceLabel(req));
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token) });
}

async function sync(env: Env, req: Request, deps: Deps): Promise<Response> {
  const { push, since } = await body<{ push?: unknown[]; since?: number }>(req);
  const now = deps.now();
  const incoming = Array.isArray(push) ? push : [];
  if (incoming.length > PUSH_MAX) throw new HttpError(413, `At most ${PUSH_MAX} events per request`);
  const valid: Event[] = incoming.filter(isEvent);
  if (valid.length) {
    const stmts: D1PreparedStatement[] = valid.map((e) =>
      env.DB.prepare('INSERT OR IGNORE INTO events (id, t, body, received) VALUES (?, ?, ?, ?)').bind(e.id, e.t, JSON.stringify(e), now),
    );
    await env.DB.batch(stmts);
  }
  const cursor = Number.isFinite(since) ? Number(since) : 0;
  const { results } = await env.DB
    .prepare('SELECT seq, body FROM events WHERE seq > ? ORDER BY seq LIMIT ?')
    .bind(cursor, PULL_MAX + 1)
    .all<{ seq: number; body: string }>();
  const page = results.slice(0, PULL_MAX);
  return json({
    accepted: valid.map((e) => e.id),
    rejected: incoming.length - valid.length,
    events: page.map((r) => JSON.parse(r.body) as Event),
    cursor: page.length ? page[page.length - 1].seq : cursor,
    more: results.length > PULL_MAX,
  });
}

export async function handleApi(req: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  try {
    if (!env.DB) throw new HttpError(503, 'Sync is not set up yet (no D1 database bound).');
    const now = deps.now();
    if (method === 'POST' && path === '/api/auth/request') return await requestCode(env, req, deps);
    if (method === 'POST' && path === '/api/auth/verify') return await verifyCode(env, req, deps);
    if (method === 'POST' && path === '/api/pair/redeem') return await redeemPairing(env, req, deps);

    const session = await currentSession(env.DB, req, now);
    if (method === 'GET' && path === '/api/me') return json({ signedIn: !!session });
    if (!session) throw new HttpError(401, 'Not signed in');

    if (method === 'POST' && path === '/api/auth/logout') {
      await body(req);
      await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(session).run();
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
    }
    if (method === 'POST' && path === '/api/auth/logout-all') {
      await body(req);
      await env.DB.prepare('DELETE FROM sessions').run();
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
    }
    if (method === 'POST' && path === '/api/pair/create') {
      await body(req);
      return await createPairing(env, deps);
    }
    if (method === 'POST' && path === '/api/sync') return await sync(env, req, deps);
    throw new HttpError(404, 'Not found');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Server error' }, 500);
  }
}
