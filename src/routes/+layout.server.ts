import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ request }) => {
  // Session data will be available from the custom server's session middleware
  // via request headers. For now, return empty auth state.
  return {
    authenticated: false,
    user: null,
  };
};
