<script lang="ts">
  import qrcode from 'qrcode-generator';
  import { account, createPairing, redeemPairing, requestCode, signOut, syncNow, verifyCode } from './client.svelte';

  /** B12: sign in by email code, link another device with a QR code, sync status. Lives in Settings. */
  let email = $state('');
  let code = $state('');
  let sent = $state(false);
  let busy = $state(false);
  let msg = $state('');
  let pairInput = $state('');
  let pairing = $state<{ code: string; expires: number; svg: string } | null>(null);
  let now = $state(Date.now());

  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  async function run(f: () => Promise<void>) {
    busy = true;
    msg = '';
    try {
      await f();
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const send = () => run(async () => {
    await requestCode(email);
    sent = true;
  });
  const verify = () => run(async () => {
    await verifyCode(email, code);
    sent = false;
    code = '';
  });
  const redeem = () => run(() => redeemPairing(pairInput));
  const out = (everywhere: boolean) => run(() => signOut(everywhere));

  const pair = () => run(async () => {
    const p = await createPairing();
    const url = `${location.origin}/#/pair/${p.code}`;
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    pairing = { ...p, svg: qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true }) };
  });

  const left = $derived(pairing ? Math.max(0, Math.round((pairing.expires - now) / 1000)) : 0);
  $effect(() => {
    if (pairing && left === 0) pairing = null;
  });

  function ago(t: number): string {
    const s = Math.round((now - t) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return `${s} s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    return new Date(t).toLocaleString();
  }
</script>

{#if account.signedIn}
  <p>
    Signed in. Progress syncs automatically.
    <span class="muted">
      {#if account.syncing}Syncing…{:else if account.lastSync}Last sync {ago(account.lastSync)}.{/if}
    </span>
  </p>
  {#if account.error}<p class="feedback warn">{account.error}</p>{/if}
  <div class="actions">
    <button class="btn" disabled={busy || account.syncing} onclick={() => run(syncNow)}>Sync now</button>
    <button class="btn" disabled={busy} onclick={pair}>Link another device</button>
  </div>

  {#if pairing}
    <div class="pair">
      <div class="qr">{@html pairing.svg}</div>
      <div>
        <p>Scan this with the other device’s camera, or open <strong>Settings → Account</strong> there and type the code:</p>
        <p class="code">{pairing.code}</p>
        <p class="muted small">Works once · expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>
        <p class="muted small">
          On iPhone, a QR code opens Safari, and the Home Screen app keeps its own sign-in. To link the Home Screen
          app, type the code there instead.
        </p>
      </div>
    </div>
  {/if}

  <div class="actions">
    <button class="btn ghost small" disabled={busy} onclick={() => out(false)}>Sign out of this device</button>
    <button class="btn ghost small" disabled={busy} onclick={() => out(true)}>Sign out everywhere</button>
  </div>
{:else if !account.available && account.signedIn !== null}
  <p class="muted">
    {account.error || 'Sync isn’t reachable.'} Your progress is saved on this device; use the backup below to move it
    by hand.
  </p>
{:else}
  <p class="muted">Sign in to sync progress between your phone and computer. Without it, progress stays on this device.</p>
  {#if !sent}
    <form class="row" onsubmit={(e) => { e.preventDefault(); send(); }}>
      <input type="email" autocomplete="email" placeholder="you@example.com" bind:value={email} required />
      <button class="btn primary" disabled={busy || !email}>Email me a code</button>
    </form>
  {:else}
    <form class="row" onsubmit={(e) => { e.preventDefault(); verify(); }}>
      <input inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code" maxlength="7" bind:value={code} required />
      <button class="btn primary" disabled={busy || code.replace(/\D/g, '').length !== 6}>Sign in</button>
    </form>
    <p class="muted small">Sent to {email} if it’s the account’s address. <button class="link" onclick={() => (sent = false)}>Change</button></p>
  {/if}

  <p class="muted small or">Or, with a pairing code from a signed-in device:</p>
  <form class="row" onsubmit={(e) => { e.preventDefault(); redeem(); }}>
    <input autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABCD-2345" bind:value={pairInput} />
    <button class="btn" disabled={busy || pairInput.replace(/[^A-Za-z0-9]/g, '').length !== 8}>Link</button>
  </form>
{/if}

{#if msg}<p class="feedback bad">{msg}</p>{/if}

<style>
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
  .row input {
    flex: 1;
    min-width: 12em;
    font: inherit;
    font-size: 16px;
    padding: 9px 12px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--text);
  }
  .small { font-size: 0.85rem; }
  .or { margin-top: 16px; }
  .pair { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; margin: 14px 0; }
  .qr { width: 190px; height: 190px; background: #fff; border-radius: 8px; flex: none; }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .pair > div:last-child { flex: 1; min-width: 14em; }
  .code { font-family: var(--mono); font-size: 1.6rem; letter-spacing: 0.08em; margin: 0.2em 0; }
  .link { background: none; border: none; padding: 0; color: var(--accent); font-size: inherit; }
</style>
