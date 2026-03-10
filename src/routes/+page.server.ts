import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
  const { authenticated, user } = await parent();
  return { authenticated, user };
};
