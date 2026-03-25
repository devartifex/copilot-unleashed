---
applyTo: "src/lib/server/**/*.ts, server.js"
description: "GitHub Copilot SDK Node.js patterns — client lifecycle, sessions, streaming, tools, events"
---

# GitHub Copilot SDK Node.js Instructions

## Core Principles

- SDK is in technical preview — may have breaking changes
- Requires Node.js 18+ and GitHub Copilot CLI in PATH
- Uses async/await throughout with full TypeScript definitions
- Each `CopilotClient` spawns a CLI subprocess — MUST call `.stop()` on disconnect

## Client Lifecycle

```typescript
import { CopilotClient } from "@github/copilot-sdk";

const client = new CopilotClient();
await client.start();
// Use client...
await client.stop(); // ALWAYS stop to clean up subprocess
```

Key options: `autoStart`, `autoRestart`, `useStdio` (default: true), `port` (default: 0 = random), `logLevel`, `cwd`, `env`.

## Session Management

```typescript
const session = await client.createSession({
  model: "gpt-4.1",
  streaming: true,
  tools: [...],
  systemMessage: { mode: "append", content: "..." },
});
```

- Resume: `client.resumeSession("session-id", { tools: [...] })`
- Destroy: `await session.destroy()` — always clean up
- List: `await client.listSessions()`

## Event Handling

Use discriminated unions with switch statements:

```typescript
session.on((event) => {
  switch (event.type) {
    case "assistant.message": // Final complete message
    case "assistant.message.delta": // Streaming chunk
    case "assistant.reasoning": // Reasoning content
    case "assistant.reasoning.delta": // Reasoning chunk
    case "tool.executionStart": // Tool invoked
    case "tool.executionComplete": // Tool finished
    case "session.idle": // Processing complete
    case "session.error": // Error occurred
  }
});
```

The `on()` method returns an unsubscribe function — always unsubscribe when done.

## Streaming

Enable with `streaming: true` in SessionConfig. Handle both delta events (incremental) and final events (always sent regardless of streaming setting).

## Custom Tools

Use `defineTool` for type-safe definitions:

```typescript
import { defineTool } from "@github/copilot-sdk";

defineTool({
  name: "my_tool",
  description: "What it does",
  parameters: { type: "object", properties: { ... }, required: [...] },
  handler: async (args) => { return result; },
});
```

Supports Zod schemas for runtime parameter validation.

## System Message

- `mode: "append"` (default) — preserves guardrails, adds your content
- `mode: "replace"` — full control, removes guardrails

## Resource Cleanup

ALWAYS use try-finally:

```typescript
const client = new CopilotClient();
try {
  await client.start();
  const session = await client.createSession();
  try {
    // Use session...
  } finally {
    await session.destroy();
  }
} finally {
  await client.stop();
}
```

## Best Practices

1. Always try-finally for resource cleanup
2. Use Promises to wait for session.idle
3. Handle session.error events
4. Use defineTool for type-safe tools
5. Enable streaming for interactive UX
6. Use systemMessage mode "append" to preserve guardrails
7. Handle both delta and final events when streaming
