import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

export default defineConfig({
  plugins: [svelte(), mathliveFonts()],
  build: { target: ['es2020', 'safari14'], chunkSizeWarningLimit: 900 },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
