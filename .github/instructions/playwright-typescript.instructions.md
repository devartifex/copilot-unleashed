---
description: 'Playwright test writing standards — role-based locators, auto-waiting, aria snapshots'
applyTo: 'tests/**/*.ts, playwright.config.ts'
---

# Playwright Test Instructions

## Test Writing Standards

### Locators
- Prioritize user-facing, role-based locators (`getByRole`, `getByLabel`, `getByText`) for resilience and accessibility
- Use `test.step()` to group interactions and improve readability

### Assertions
- Use auto-retrying web-first assertions with `await` (e.g., `await expect(locator).toHaveText()`)
- Avoid `expect(locator).toBeVisible()` unless specifically testing visibility changes
- Use `toMatchAriaSnapshot` for accessibility tree structure verification

### Timeouts
- Rely on Playwright's built-in auto-waiting — avoid hard-coded waits or increased timeouts

### Organization
- Group related tests under `test.describe()` blocks
- Use `beforeEach` for common setup (e.g., navigating to a page)
- Follow naming: `Feature - Specific action or scenario`
- One test file per major feature: `<feature>.spec.ts`

## Project-Specific Patterns

### Authenticated Tests
```typescript
import { createAuthenticatedPage, mockWebSocket, goToChat } from './helpers';

test('should send message', async ({ browser }) => {
  const { page } = await createAuthenticatedPage(browser);
  const ws = await mockWebSocket(page);
  await goToChat(page);
  // ... test logic
});
```

### Test Projects
- `desktop` (1280x720) and `mobile` (375x667) viewports
- Run specific: `npx playwright test --project=desktop`

### WebSocket Mocking
- Use `mockWebSocket()` from `tests/helpers.ts` to intercept WS connections
- Simulate server responses for chat message testing

## Assertion Best Practices

- **UI Structure**: `toMatchAriaSnapshot` for accessibility tree
- **Element Counts**: `toHaveCount` for number of elements
- **Text Content**: `toHaveText` (exact) / `toContainText` (partial)
- **Navigation**: `toHaveURL` to verify page URL after actions

## Quality Checklist

- [ ] All locators are accessible and specific
- [ ] Tests are grouped logically with clear structure
- [ ] Assertions reflect user expectations
- [ ] No hard-coded waits or timeouts
- [ ] WebSocket interactions properly mocked
