import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { checkAuth } from '$lib/server/auth/guard.js';
import { scanSkills } from '$lib/server/skills/scanner.js';

export const GET: RequestHandler = async ({ locals }) => {
  const auth = checkAuth(locals.session);
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const skills = await scanSkills();
  return json({
    skills: skills.map(({ name, description, license, allowedTools }) => ({
      name,
      description,
      license,
      allowedTools,
    })),
  });
};
