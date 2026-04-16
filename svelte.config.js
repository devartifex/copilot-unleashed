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
		// Full CSP with per-request nonces for inline scripts/styles.
		// All directives consolidated here so only one CSP header is emitted
		// (multiple headers enforce the intersection, which can break nonces).
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'connect-src': [
					'self',
					'ws:',
					'wss:',
					'https://*.push.services.mozilla.com',
					'https://*.push.apple.com',
					'https://fcm.googleapis.com',
					'https://*.notify.windows.com',
				],
				'worker-src': ['self', 'blob:'],
				'img-src': ['self', 'data:', 'blob:', 'https://avatars.githubusercontent.com'],
				'font-src': ['self'],
				'frame-ancestors': ['none'],
				'form-action': ['self'],
				'base-uri': ['self'],
				'manifest-src': ['self'],
				'object-src': ['none'],
			},
		},
	},
};

export default config;
