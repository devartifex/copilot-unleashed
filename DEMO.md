# 🎤 Demo — GitHub Copilot Dev Days

> **Sessione:** 30 minuti · **Demo live:** ~5 minuti · **Branch:** `demo/devdays`

## 📋 File da aprire durante la demo

| Step | File | Link diretto |
|------|------|-------------|
| 1 · Dipendenza | `package.json` line 41 | [📄 package.json](https://github.com/devartifex/copilot-unleashed/blob/demo/devdays/package.json#L41) |
| 2 · CopilotClient | `src/lib/server/copilot/client.ts` | [📄 client.ts](https://github.com/devartifex/copilot-unleashed/blob/demo/devdays/src/lib/server/copilot/client.ts) |
| 3 · SessionConfig | `src/lib/server/copilot/session.ts` | [📄 session.ts](https://github.com/devartifex/copilot-unleashed/blob/demo/devdays/src/lib/server/copilot/session.ts#L229) |
| 4 · Eventi SDK | `src/lib/server/ws/session-events.ts` | [📄 session-events.ts](https://github.com/devartifex/copilot-unleashed/blob/demo/devdays/src/lib/server/ws/session-events.ts#L43) |
| 5 · session.send() | `src/lib/server/ws/message-handlers/chat.ts` | [📄 chat.ts](https://github.com/devartifex/copilot-unleashed/blob/demo/devdays/src/lib/server/ws/message-handlers/chat.ts#L13) |

---

## Panoramica

**Copilot Unleashed** è un'applicazione chat multi-modello self-hosted costruita
interamente con il **GitHub Copilot SDK** (`@github/copilot-sdk`).

```
Browser (Svelte 5)  →  WebSocket  →  Node.js Server  →  Copilot SDK  →  GitHub Copilot
```

---

## Step 1 · La dipendenza — [`package.json`](https://github.com/devartifex/copilot-unleashed/blob/demo/devdays/package.json#L41)

```json
"@github/copilot-sdk": "^0.2.0"
```

> L'unica dipendenza necessaria. Disponibile in TypeScript, Python, .NET e Go.

---

## Step 2 · Creare il Client — [`client.ts`](https://github.com/devartifex/copilot-unleashed/blob/demo/devdays/src/lib/server/copilot/client.ts)

```typescript
import { CopilotClient } from '@github/copilot-sdk';

export function createCopilotClient(githubToken: string): CopilotClient {
  return new CopilotClient({
    githubToken,
    env: { ...process.env, GH_TOKEN: githubToken },
    cwd: homedir(),
  });
}
```

> **Punto chiave:** bastano 3 righe. Il token GitHub è tutto ciò che serve.

---

## Step 3 · Creare una Sessione — [`session.ts`](https://github.com/devartifex/copilot-unleashed/blob/demo/devdays/src/lib/server/copilot/session.ts#L229)

```typescript
const sessionConfig: SessionConfig = {
  clientName: 'copilot-unleashed',
  model: 'gpt-4.1',
  streaming: true,
  onPermissionRequest: permissionHandler,
  mcpServers: await buildSessionMcpServers(githubToken),
};

return client.createSession(sessionConfig);
```

> **Punto chiave:** `SessionConfig` è dove configurate tutto — modello, streaming,
> istruzioni custom, MCP servers, agenti personalizzati, hook del ciclo di vita.

---

## Step 4 · Ascoltare gli Eventi — [`session-events.ts`](https://github.com/devartifex/copilot-unleashed/blob/demo/devdays/src/lib/server/ws/session-events.ts#L43)

```typescript
session.on('assistant.message_delta', (event) => {
  poolSend(entry, { type: 'delta', content: event.data.deltaContent });
});

session.on('tool.execution_start', (event) => {
  poolSend(entry, { type: 'tool_start', toolName: event.data.toolName });
});

session.on('assistant.turn_end', () => {
  poolSend(entry, { type: 'turn_end' });
});
```

> **Punto chiave:** 26+ tipi di eventi — streaming, reasoning, tool, piani, sub-agenti.

---

## Step 5 · Inviare Messaggi — [`chat.ts`](https://github.com/devartifex/copilot-unleashed/blob/demo/devdays/src/lib/server/ws/message-handlers/chat.ts#L13)

```typescript
await connectionEntry.session.send({
  prompt,
  attachments: allAttachments,
  mode: sendMode,
});
```

> **Punto chiave:** una sola chiamata `session.send()`. Supporta allegati e modalità diverse.

---

## Step 6 · Demo Live 🚀

```bash
npm run dev
# → http://localhost:3000
```

Mostrare in sequenza:
1. Login con GitHub (Device Flow — no password, solo codice)
2. Selezione del modello (Claude, GPT-4.1, Gemini…)
3. Invio di un messaggio → streaming della risposta in tempo reale
4. Tool execution visibile nell'UI
5. Cambio modalità: Chat → Autopilot
