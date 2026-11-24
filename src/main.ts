import 'katex/dist/katex.min.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { registerServiceWorker } from './pwa/offline.svelte';
import { progress } from './progress/store.svelte';
import { startSync } from './sync/client.svelte';
import { applySyncedSettings } from './lib/settings.svelte';

registerServiceWorker();
progress.init().then(() => {
  applySyncedSettings();
  startSync();
});

const app = mount(App, { target: document.getElementById('app')! });

export default app;
