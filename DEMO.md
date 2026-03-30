# 🎤 Demo Walkthrough — GitHub Copilot SDK

> **Tempo stimato:** ~5 minuti di walkthrough codice + UI live

## Panoramica

**Copilot Unleashed** è un'applicazione chat multi-modello self-hosted costruita
interamente con il **GitHub Copilot SDK** (`@github/copilot-sdk`).

Architettura: **Browser (Svelte 5)** → **WebSocket** → **Node.js Server** → **Copilot SDK** → **GitHub Copilot**

---

## Step 1 — La dipendenza (package.json)

```bash
# Mostrare la riga 41 di package.json
"@github/copilot-sdk": "^0.2.0"
```

> Questa è l'unica dipendenza necessaria per integrare il Copilot SDK.

---

## Step 2 — Creare il Client (src/lib/server/copilot/client.ts)

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

> **Punto chiave:** bastano 3 righe per creare un client. Il token GitHub è tutto ciò che serve.

---

## Step 3 — Creare una Sessione (src/lib/server/copilot/session.ts)

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

> **Punto chiave:** SessionConfig è dove configurate tutto — modello, streaming,
> istruzioni custom, server MCP, agenti personalizzati, hook per il ciclo di vita.

---

## Step 4 — Ascoltare gli Eventi (src/lib/server/ws/session-events.ts)

```typescript
session.on('assistant.message_delta', (event) => {
  // Streaming del testo in tempo reale
  poolSend(entry, { type: 'delta', content: event.data.deltaContent });
});

session.on('tool.execution_start', (event) => {
  // L'agente sta usando uno strumento
  poolSend(entry, { type: 'tool_start', toolName: event.data.toolName });
});

session.on('assistant.turn_end', () => {
  // Il turno è completo
  poolSend(entry, { type: 'turn_end' });
});
```

> **Punto chiave:** 26+ tipi di eventi — dal testo in streaming, al reasoning,
> all'esecuzione di tool, alla gestione dei piani, fino ai sub-agenti.

---

## Step 5 — Inviare Messaggi (src/lib/server/ws/message-handlers/chat.ts)

```typescript
await connectionEntry.session.send({
  prompt,
  attachments: allAttachments,
  mode: sendMode,
});
```

> **Punto chiave:** una singola chiamata `session.send()` per inviare messaggi.
> Supporta allegati, menzioni di file, e diverse modalità di invio.

---

## Step 6 — Demo Live 🚀

```bash
npm run dev
```

> Aprire il browser su http://localhost:3000 e mostrare:
> 1. Login con GitHub (Device Flow)
> 2. Selezione del modello (Claude, GPT, Gemini...)
> 3. Invio di un messaggio e streaming della risposta
> 4. Tool execution in tempo reale
> 5. Cambio modalità (Chat → Autopilot)
