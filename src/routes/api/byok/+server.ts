import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAuth } from '$lib/server/auth/guard';
import { config } from '$lib/server/config';
import {
  saveProviderConfig,
  loadProviderConfig,
  deleteProviderConfig,
  sanitizeProviderForClient,
} from '$lib/server/byok/provider-store';

/** GET /api/byok — returns sanitized provider config (no secrets) */
export const GET: RequestHandler = async ({ locals }) => {
  const auth = checkAuth(locals.session);
  if (!auth.authenticated || !auth.user?.login) {
    return json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!config.byokEnabled) {
    return json({ error: 'BYOK is not enabled on this server' }, { status: 403 });
  }

  try {
    const provider = await loadProviderConfig(auth.user.login);
    if (!provider) {
      return json({ provider: null });
    }
    return json({ provider: sanitizeProviderForClient(provider) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[BYOK] Load error:', message);
    return json({ error: 'Failed to load provider config' }, { status: 500 });
  }
};

/** PUT /api/byok — save or update provider config (API keys encrypted at rest) */
export const PUT: RequestHandler = async ({ locals, request }) => {
  const auth = checkAuth(locals.session);
  if (!auth.authenticated || !auth.user?.login) {
    return json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!config.byokEnabled) {
    return json({ error: 'BYOK is not enabled on this server' }, { status: 403 });
  }

  try {
    const body = await request.json() as { provider?: Record<string, unknown> };
    if (!body.provider || typeof body.provider !== 'object') {
      return json({ error: 'Missing provider object' }, { status: 400 });
    }

    const raw = body.provider;

    if (typeof raw.baseUrl !== 'string' || !raw.baseUrl.trim()) {
      return json({ error: 'baseUrl is required' }, { status: 400 });
    }

    // Validate baseUrl — require HTTPS (allow HTTP only for localhost/127.0.0.1 in dev)
    try {
      const url = new URL(raw.baseUrl as string);
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
        return json({ error: 'baseUrl must use HTTPS (HTTP is only allowed for localhost)' }, { status: 400 });
      }
    } catch {
      return json({ error: 'Invalid baseUrl' }, { status: 400 });
    }

    const validTypes = new Set(['openai', 'azure', 'anthropic']);
    const type = typeof raw.type === 'string' && validTypes.has(raw.type)
      ? (raw.type as 'openai' | 'azure' | 'anthropic')
      : undefined;

    const validWireApis = new Set(['completions', 'responses']);
    const wireApi = typeof raw.wireApi === 'string' && validWireApis.has(raw.wireApi)
      ? (raw.wireApi as 'completions' | 'responses')
      : undefined;

    await saveProviderConfig(auth.user.login, {
      type,
      baseUrl: (raw.baseUrl as string).trim(),
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : undefined,
      bearerToken: typeof raw.bearerToken === 'string' ? raw.bearerToken : undefined,
      wireApi,
      azure: raw.azure && typeof raw.azure === 'object'
        ? { apiVersion: typeof (raw.azure as Record<string, unknown>).apiVersion === 'string' ? (raw.azure as Record<string, unknown>).apiVersion as string : undefined }
        : undefined,
    });

    console.log(`[BYOK] Provider config saved for ${auth.user.login}`);
    return json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[BYOK] Save error:', message);
    return json({ error: 'Failed to save provider config' }, { status: 500 });
  }
};

/** DELETE /api/byok — remove provider config */
export const DELETE: RequestHandler = async ({ locals }) => {
  const auth = checkAuth(locals.session);
  if (!auth.authenticated || !auth.user?.login) {
    return json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!config.byokEnabled) {
    return json({ error: 'BYOK is not enabled on this server' }, { status: 403 });
  }

  try {
    await deleteProviderConfig(auth.user.login);
    console.log(`[BYOK] Provider config deleted for ${auth.user.login}`);
    return json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[BYOK] Delete error:', message);
    return json({ error: 'Failed to delete provider config' }, { status: 500 });
  }
};
