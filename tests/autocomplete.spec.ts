import { test, expect } from '@playwright/test';
import { createAuthenticatedPage, mockWebSocket, goToChat } from './helpers';

test.describe('Autocomplete features', () => {
	test.describe('@ file mentions', () => {
		test('shows file results when API returns files', async ({ browser }) => {
			const { page } = await createAuthenticatedPage(browser);

			await page.route('**/api/files*', (route) =>
				route.fulfill({
					json: { files: ['src/app.ts', 'src/lib/utils.ts', 'README.md'] },
				}),
			);

			await mockWebSocket(page);
			await goToChat(page);

			const textarea = page.locator('textarea').first();
			await textarea.focus();
			await textarea.pressSequentially('@');

			const popover = page.locator('[aria-label="File mentions"]');
			await expect(popover).toBeVisible();
			await expect(popover.locator('.mention-item')).toHaveCount(3);
			await expect(popover.locator('.mention-path').first()).toContainText('src/app.ts');
		});

		test('shows "No files found" when API returns empty', async ({ browser }) => {
			const { page } = await createAuthenticatedPage(browser);

			await page.route('**/api/files*', (route) =>
				route.fulfill({ json: { files: [] } }),
			);

			await mockWebSocket(page);
			await goToChat(page);

			const textarea = page.locator('textarea').first();
			await textarea.focus();
			await textarea.pressSequentially('@');

			const popover = page.locator('[aria-label="File mentions"]');
			await expect(popover).toBeVisible();
			await expect(popover).toContainText('No files found');
		});

		test('shows error feedback when API fails', async ({ browser }) => {
			const { page } = await createAuthenticatedPage(browser);

			await page.route('**/api/files*', (route) =>
				route.fulfill({ json: { files: [], error: 'No git workspace available' } }),
			);

			await mockWebSocket(page);
			await goToChat(page);

			const textarea = page.locator('textarea').first();
			await textarea.focus();
			await textarea.pressSequentially('@');

			const popover = page.locator('[aria-label="File mentions"]');
			await expect(popover).toBeVisible();
			await expect(popover).toContainText('No git workspace available');
		});

		test('filters files as user types query', async ({ browser }) => {
			const { page } = await createAuthenticatedPage(browser);

			await page.route('**/api/files*', (route) => {
				const url = new URL(route.request().url());
				const q = url.searchParams.get('q') ?? '';
				const allFiles = ['src/app.ts', 'src/lib/utils.ts', 'README.md'];
				const filtered = q ? allFiles.filter((f) => f.includes(q)) : allFiles;
				route.fulfill({ json: { files: filtered } });
			});

			await mockWebSocket(page);
			await goToChat(page);

			const textarea = page.locator('textarea').first();
			await textarea.focus();
			await textarea.pressSequentially('@utils');

			const popover = page.locator('[aria-label="File mentions"]');
			await expect(popover).toBeVisible();
			await expect(popover.locator('.mention-item')).toHaveCount(1);
			await expect(popover.locator('.mention-path').first()).toContainText('utils');
		});

		test('inserts selected file into input', async ({ browser }) => {
			const { page } = await createAuthenticatedPage(browser);

			await page.route('**/api/files*', (route) =>
				route.fulfill({ json: { files: ['src/app.ts'] } }),
			);

			await mockWebSocket(page);
			await goToChat(page);

			const textarea = page.locator('textarea').first();
			await textarea.focus();
			await textarea.pressSequentially('@');

			const popover = page.locator('[aria-label="File mentions"]');
			await expect(popover.locator('.mention-item')).toHaveCount(1);

			await textarea.press('Enter');
			await expect(textarea).toHaveValue('@src/app.ts ');
		});

		test('closes popover on Escape', async ({ browser }) => {
			const { page } = await createAuthenticatedPage(browser);

			await page.route('**/api/files*', (route) =>
				route.fulfill({ json: { files: ['src/app.ts'] } }),
			);

			await mockWebSocket(page);
			await goToChat(page);

			const textarea = page.locator('textarea').first();
			await textarea.focus();
			await textarea.pressSequentially('@');

			const popover = page.locator('[aria-label="File mentions"]');
			await expect(popover).toBeVisible();

			await textarea.press('Escape');
			await expect(popover).not.toBeVisible();
		});
	});

	test.describe('# issue/PR references', () => {
		test('shows issue results when API returns issues', async ({ browser }) => {
			const { page } = await createAuthenticatedPage(browser);

			await page.route('**/api/issues*', (route) =>
				route.fulfill({
					json: {
						items: [
							{ number: 42, title: 'Fix login bug', type: 'issue', state: 'open' },
							{ number: 15, title: 'Add dark mode', type: 'pr', state: 'closed' },
						],
					},
				}),
			);

			await mockWebSocket(page);
			await goToChat(page);

			const textarea = page.locator('textarea').first();
			await textarea.focus();
			await textarea.pressSequentially('#');

			const popover = page.locator('[aria-label="Issues and pull requests"]');
			await expect(popover).toBeVisible();
			await expect(popover.locator('.mention-item')).toHaveCount(2);
			await expect(popover.locator('.issue-number').first()).toContainText('#42');
		});

		test('shows "No issues found" when API returns empty', async ({ browser }) => {
			const { page } = await createAuthenticatedPage(browser);

			await page.route('**/api/issues*', (route) =>
				route.fulfill({ json: { items: [] } }),
			);

			await mockWebSocket(page);
			await goToChat(page);

			const textarea = page.locator('textarea').first();
			await textarea.focus();
			await textarea.pressSequentially('#');

			const popover = page.locator('[aria-label="Issues and pull requests"]');
			await expect(popover).toBeVisible();
			await expect(popover).toContainText('No issues found');
		});

		test('shows repo name when results include repo info', async ({ browser }) => {
			const { page } = await createAuthenticatedPage(browser);

			await page.route('**/api/issues*', (route) =>
				route.fulfill({
					json: {
						items: [
							{ number: 42, title: 'Fix login bug', type: 'issue', state: 'open', repo: 'octocat/hello-world' },
							{ number: 7, title: 'Add tests', type: 'pr', state: 'open', repo: 'octocat/spoon-knife' },
						],
					},
				}),
			);

			await mockWebSocket(page);
			await goToChat(page);

			const textarea = page.locator('textarea').first();
			await textarea.focus();
			await textarea.pressSequentially('#');

			const popover = page.locator('[aria-label="Issues and pull requests"]');
			await expect(popover).toBeVisible();
			await expect(popover.locator('.issue-repo').first()).toContainText('octocat/hello-world');
		});

		test('inserts full repo#number reference for cross-repo issues', async ({ browser }) => {
			const { page } = await createAuthenticatedPage(browser);

			await page.route('**/api/issues*', (route) =>
				route.fulfill({
					json: {
						items: [{ number: 42, title: 'Fix bug', type: 'issue', state: 'open', repo: 'octocat/hello-world' }],
					},
				}),
			);

			await mockWebSocket(page);
			await goToChat(page);

			const textarea = page.locator('textarea').first();
			await textarea.focus();
			await textarea.pressSequentially('#');

			const popover = page.locator('[aria-label="Issues and pull requests"]');
			await expect(popover.locator('.mention-item')).toHaveCount(1);

			await textarea.press('Enter');
			await expect(textarea).toHaveValue('octocat/hello-world#42 ');
		});

		test('closes popover on Escape', async ({ browser }) => {
			const { page } = await createAuthenticatedPage(browser);

			await page.route('**/api/issues*', (route) =>
				route.fulfill({
					json: {
						items: [{ number: 1, title: 'Test', type: 'issue', state: 'open' }],
					},
				}),
			);

			await mockWebSocket(page);
			await goToChat(page);

			const textarea = page.locator('textarea').first();
			await textarea.focus();
			await textarea.pressSequentially('#');

			const popover = page.locator('[aria-label="Issues and pull requests"]');
			await expect(popover).toBeVisible();

			await textarea.press('Escape');
			await expect(popover).not.toBeVisible();
		});
	});
});
