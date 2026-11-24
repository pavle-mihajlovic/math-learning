/**
 * Cloudflare Worker entry (B12). wrangler.jsonc routes only /api/* here (`run_worker_first`);
 * every other path is served straight from the static assets in dist/.
 */
import { handleApi, resendMailer, type Env as ApiEnv } from './api';

interface Env extends ApiEnv {
  ASSETS: { fetch(req: Request): Promise<Response> };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApi(req, env, { now: () => Date.now(), mail: resendMailer(env) });
    }
    return env.ASSETS.fetch(req);
  },
};
