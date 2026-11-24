import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';

/**
 * MathLive loads its fonts at runtime from `MathfieldElement.fontsDirectory`.
 * Serve them from /mathlive/fonts in dev and copy them into dist on build,
 * so the visual editor works offline and needs no CDN.
 */
function mathliveFonts(): Plugin {
  const src = resolve('node_modules/mathlive/fonts');
  return {
    name: 'mathlive-fonts',
    configureServer(server) {
      server.middlewares.use('/mathlive/fonts', (req, res, next) => {
        const file = resolve(src, '.' + (req.url ?? '').split('?')[0]);
        if (!file.startsWith(src) || !existsSync(file)) return next();
        res.setHeader('Content-Type', 'font/woff2');
        res.end(readFileSync(file));
      });
    },
    writeBundle(options) {
      const out = resolve(options.dir ?? 'dist', 'mathlive/fonts');
      mkdirSync(out, { recursive: true });
      cpSync(src, out, { recursive: true });
    },
  };
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? listFiles(resolve(dir, d.name)) : [resolve(dir, d.name)],
  );
}

/**
 * B10: write dist/sw.js from src/pwa/sw.js with the list of app-shell files to precache
 * (index.html, hashed JS/CSS, woff2 fonts, icons) and a version derived from their names.
 * Runs after mathliveFonts so the MathLive fonts are in the list.
 */
function serviceWorker(): Plugin {
  return {
    name: 'rtr-service-worker',
    apply: 'build',
    writeBundle: {
      sequential: true,
      order: 'post',
      handler(options) {
        const dist = resolve(options.dir ?? 'dist');
        const shell = listFiles(dist)
          .map((f) => '/' + relative(dist, f).split('\\').join('/'))
          .filter((u) =>
            u === '/index.html' ||
            u === '/manifest.webmanifest' ||
            u === '/icon.svg' ||
            u.startsWith('/icons/') ||
            (u.startsWith('/assets/') && /\.(js|css|woff2)$/.test(u)) ||
            (u.startsWith('/mathlive/') && u.endsWith('.woff2')),
          )
          .sort();
        const hash = createHash('sha256');
        for (const u of shell) hash.update(u).update(readFileSync(resolve(dist, '.' + u)));
        const version = hash.digest('hex').slice(0, 12);
        const sw = readFileSync(resolve('src/pwa/sw.js'), 'utf8')
          .replace("'__VERSION__'", JSON.stringify(version))
          .replace('__PRECACHE__', JSON.stringify(shell));
        writeFileSync(resolve(dist, 'sw.js'), sw);
      },
    },
  };
}

export default defineConfig({
  plugins: [svelte(), mathliveFonts(), serviceWorker()],
  build: { target: ['es2020', 'safari14'], chunkSizeWarningLimit: 900 },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'worker/**/*.test.ts'],
    environment: 'node',
  },
});
