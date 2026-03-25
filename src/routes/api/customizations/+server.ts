import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { checkAuth } from '$lib/server/auth/guard.js';
import { scanCustomizations } from '$lib/server/customizations/scanner.js';
import { config } from '$lib/server/config.js';

export const GET: RequestHandler = async ({ locals }) => {
  const auth = checkAuth(locals.session);
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const customizations = await scanCustomizations(
    config.copilotConfigDir,
    config.copilotCwd,
  );

  return json({
    instructions: customizations.instructions.map(({ name, source, path, content, applyTo }) => ({
      name,
      source,
      path,
      content,
      ...(applyTo && { applyTo }),
    })),
    agents: customizations.agents.map(({ name, source, path, description, tools }) => ({
      name,
      source,
      path,
      ...(description && { description }),
      ...(tools && { tools }),
    })),
    prompts: customizations.prompts.map(({ name, source, path, description, content }) => ({
      name,
      source,
      path,
      description,
      content,
    })),
  });
};
