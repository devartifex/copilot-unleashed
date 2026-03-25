import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAuth } from '$lib/server/auth/guard';
import { execSync } from 'node:child_process';

const GITHUB_API_URL = 'https://api.github.com';
const MAX_RESULTS = 10;
const CACHE_TTL_MS = 60_000;

let cachedRepo: string | null = null;
let repoCacheTimestamp = 0;

/** Reset cache — for testing only */
export function _resetCache(): void {
	cachedRepo = null;
	repoCacheTimestamp = 0;
}

/** Parse owner/repo from git remote URL */
function parseGitRemote(url: string): string | null {
	// SSH: git@github.com:owner/repo.git
	const sshMatch = url.match(/git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/);
	if (sshMatch) return sshMatch[1];

	// HTTPS: https://github.com/owner/repo.git
	const httpsMatch = url.match(/github\.com\/([^/]+\/[^/.]+?)(?:\.git)?$/);
	if (httpsMatch) return httpsMatch[1];

	return null;
}

/** Get the GitHub owner/repo for the current workspace */
function getRepo(): string | null {
	const now = Date.now();
	if (cachedRepo !== null && now - repoCacheTimestamp < CACHE_TTL_MS) {
		return cachedRepo || null;
	}

	// Try GITHUB_REPO env var first (works in Docker/cloud)
	const envRepo = process.env.GITHUB_REPO?.trim();
	if (envRepo && /^[^/]+\/[^/]+$/.test(envRepo)) {
		cachedRepo = envRepo;
		repoCacheTimestamp = now;
		return cachedRepo;
	}

	// Fall back to git remote detection
	try {
		const remoteUrl = execSync('git remote get-url origin', {
			encoding: 'utf-8',
			timeout: 5000,
		}).trim();
		cachedRepo = parseGitRemote(remoteUrl) ?? '';
		repoCacheTimestamp = now;
		return cachedRepo || null;
	} catch {
		cachedRepo = '';
		repoCacheTimestamp = now;
		return null;
	}
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const auth = checkAuth(locals.session);
	if (!auth.authenticated) {
		return json({ error: auth.error }, { status: 401 });
	}

	const repo = getRepo();
	const token = locals.session!.githubToken!;
	const query = url.searchParams.get('q')?.trim() ?? '';

	try {
		// Scope to repo when detected, otherwise search all visible repos
		const repoFilter = repo ? ` repo:${repo}` : '';
		const searchQuery = query
			? `${query}${repoFilter}`
			: `is:issue is:open${repoFilter} sort:updated`;

		const apiUrl = new URL(`${GITHUB_API_URL}/search/issues`);
		apiUrl.searchParams.set('q', searchQuery);
		apiUrl.searchParams.set('per_page', String(MAX_RESULTS));
		apiUrl.searchParams.set('sort', 'updated');
		apiUrl.searchParams.set('order', 'desc');

		const res = await fetch(apiUrl.toString(), {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
		});

		if (!res.ok) {
			return json({ items: [], error: `GitHub API error: ${res.status}` });
		}

		const data = await res.json();
		const items = (data.items ?? []).map((item: Record<string, unknown>) => ({
			number: item.number,
			title: item.title,
			type: item.pull_request ? 'pr' : 'issue',
			state: item.state,
			repo: typeof item.repository_url === 'string'
				? item.repository_url.replace('https://api.github.com/repos/', '')
				: undefined,
		}));

		return json({ items });
	} catch {
		return json({ items: [], error: 'Failed to fetch issues' });
	}
};
