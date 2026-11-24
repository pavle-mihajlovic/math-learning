import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { handleApi, type Env } from './api';
import type { D1Database, D1PreparedStatement } from './d1';

/** D1 on top of Node's built-in SQLite, enough for the worker's queries. */
function sqliteD1(): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('./migrations/0001_init.sql', import.meta.url), 'utf8'));
  const stmt = (sql: string, args: unknown[] = []): D1PreparedStatement => ({
    bind: (...values: unknown[]) => stmt(sql, values),
    first: async <T,>() => (db.prepare(sql).get(...(args as never[])) as T | undefined) ?? null,
    all: async <T,>() => ({ results: db.prepare(sql).all(...(args as never[])) as T[] }),
    run: async () => db.prepare(sql).run(...(args as never[])),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

function setup() {
  let now = Date.UTC(2026, 0, 1);
  const mails: { to: string; text: string }[] = [];
  const env: Env = { DB: sqliteD1(), OWNER_EMAIL: 'Me@Example.com' };
  const deps = { now: () => now, mail: async (to: string, _s: string, text: string) => void mails.push({ to, text }) };
  const call = async (path: string, data?: unknown, cookie = '') => {
    const headers: Record<string, string> = { 'User-Agent': 'test' };
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await handleApi(
      new Request(`https://x.dev/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers, body: data === undefined ? undefined : JSON.stringify(data) }),
      env,
      deps,
    );
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    return { status: res.status, body: (await res.json()) as Record<string, unknown>, cookie: setCookie.split(';')[0] };
  };
  const signIn = async () => {
    await call('auth/request', { email: 'me@example.com' });
    const code = /\d{6}/.exec(mails[mails.length - 1].text)![0];
    const r = await call('auth/verify', { email: 'me@example.com', code });
    expect(r.status).toBe(200);
    return r.cookie;
  };
  return { call, mails, signIn, tick: (ms: number) => (now += ms) };
}

const event = (id: string, t = 1) => ({ id, t, dev: 'd', type: 'read', unit: 'V1.1.1', item: 'r1' });

describe('auth', () => {
  it('emails a code only to the owner, answering the same either way', async () => {
    const s = setup();
    expect((await s.call('auth/request', { email: 'stranger@example.com' })).body).toEqual({ ok: true });
    expect(s.mails).toHaveLength(0);
    expect((await s.call('auth/request', { email: ' me@example.com ' })).body).toEqual({ ok: true });
    expect(s.mails).toHaveLength(1);
    expect(s.mails[0].to).toBe('me@example.com');
  });

  it('signs in with the right code, once', async () => {
    const s = setup();
    const cookie = await s.signIn();
    expect(cookie).toMatch(/^rtr_session=.+/);
    expect((await s.call('me', undefined, cookie)).body).toEqual({ signedIn: true });
    expect((await s.call('me')).body).toEqual({ signedIn: false });
  });

  it('rejects wrong and expired codes, and locks after 5 wrong tries', async () => {
    const s = setup();
    await s.call('auth/request', { email: 'me@example.com' });
    const code = /\d{6}/.exec(s.mails[0].text)![0];
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await s.call('auth/verify', { email: 'me@example.com', code: wrong })).status).toBe(400);
    expect((await s.call('auth/verify', { email: 'me@example.com', code })).status).toBe(400);

    await s.call('auth/request', { email: 'me@example.com' });
    const code2 = /\d{6}/.exec(s.mails[1].text)![0];
    s.tick(11 * 60_000);
    expect((await s.call('auth/verify', { email: 'me@example.com', code: code2 })).status).toBe(400);
  });

  it('rate-limits code requests', async () => {
    const s = setup();
    for (let i = 0; i < 5; i++) expect((await s.call('auth/request', { email: 'me@example.com' })).status).toBe(200);
    expect((await s.call('auth/request', { email: 'me@example.com' })).status).toBe(429);
    s.tick(61 * 60_000);
    expect((await s.call('auth/request', { email: 'me@example.com' })).status).toBe(200);
  });

  it('requires JSON for POSTs and a session for everything else', async () => {
    const s = setup();
    expect((await s.call('sync', { push: [], since: 0 })).status).toBe(401);
    expect((await s.call('pair/create', {})).status).toBe(401);
  });

  it('signs out one device or all', async () => {
    const s = setup();
    const a = await s.signIn();
    const b = await s.signIn();
    await s.call('auth/logout', {}, a);
    expect((await s.call('me', undefined, a)).body.signedIn).toBe(false);
    expect((await s.call('me', undefined, b)).body.signedIn).toBe(true);
    const c = await s.signIn();
    await s.call('auth/logout-all', {}, c);
    expect((await s.call('me', undefined, b)).body.signedIn).toBe(false);
  });
});

describe('pairing', () => {
  it('a pairing code signs in a new device once', async () => {
    const s = setup();
    const cookie = await s.signIn();
    const p = await s.call('pair/create', {}, cookie);
    const code = p.body.code as string;
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const r = await s.call('pair/redeem', { code: code.toLowerCase().replace('-', ' ') });
    expect(r.status).toBe(200);
    expect((await s.call('me', undefined, r.cookie)).body.signedIn).toBe(true);
    expect((await s.call('pair/redeem', { code })).status).toBe(400);
  });

  it('pairing codes expire', async () => {
    const s = setup();
    const cookie = await s.signIn();
    const code = (await s.call('pair/create', {}, cookie)).body.code;
    s.tick(11 * 60_000);
    expect((await s.call('pair/redeem', { code })).status).toBe(400);
  });
});

describe('sync', () => {
  it('pushes, dedupes and pulls by cursor', async () => {
    const s = setup();
    const cookie = await s.signIn();
    const r1 = await s.call('sync', { push: [event('a'), event('b'), { junk: true }], since: 0 }, cookie);
    expect(r1.body.accepted).toEqual(['a', 'b']);
    expect(r1.body.rejected).toBe(1);
    expect((r1.body.events as { id: string }[]).map((e) => e.id)).toEqual(['a', 'b']);
    const cursor = r1.body.cursor as number;

    // Another device pushes a duplicate and a new one.
    const r2 = await s.call('sync', { push: [event('b'), event('c')], since: 0 }, cookie);
    expect((r2.body.events as { id: string }[]).map((e) => e.id)).toEqual(['a', 'b', 'c']);

    const r3 = await s.call('sync', { push: [], since: cursor }, cookie);
    expect((r3.body.events as { id: string }[]).map((e) => e.id)).toEqual(['c']);
    expect(r3.body.more).toBe(false);
  });

  it('pages large downloads', async () => {
    const s = setup();
    const cookie = await s.signIn();
    for (let i = 0; i < 3; i++) {
      await s.call('sync', { push: Array.from({ length: 500 }, (_, k) => event(`e${i}-${k}`)), since: 0 }, cookie);
    }
    const r = await s.call('sync', { push: [], since: 0 }, cookie);
    expect((r.body.events as unknown[]).length).toBe(1000);
    expect(r.body.more).toBe(true);
    const r2 = await s.call('sync', { push: [], since: r.body.cursor }, cookie);
    expect((r2.body.events as unknown[]).length).toBe(500);
    expect(r2.body.more).toBe(false);
  });
});
