import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		alias: {
			$lib: 'src/lib',
		},
		csrf: {
			// Allow localhost variants — custom CSRF origin check in hooks.server.ts
			// handles production; this fixes 127.0.0.1 vs localhost mismatches in dev.
			trustedOrigins: ['http://localhost:*', 'http://127.0.0.1:*'],
		},
	},
};

export default config;
