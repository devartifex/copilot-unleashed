import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { getCopilotClient, destroyCopilotClient } from '../copilot/client.js';
import { createCopilotSession, getAvailableModels } from '../copilot/session.js';
import { runGhCopilotSuggest, runGhCopilotExplain } from '../copilot/ghCli.js';
import { config, type ChatBackend } from '../config.js';

type SessionMiddleware = (req: any, res: any, next: () => void) => void;

const MAX_MESSAGE_LENGTH = 10_000;
const VALID_MESSAGE_TYPES = new Set(['new_session', 'message', 'list_models', 'cli_suggest', 'cli_explain']);

function send(ws: WebSocket, data: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function setupWebSocket(
  server: Server,
  sessionMiddleware: SessionMiddleware
): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    // Parse Express session from upgrade request cookies
    const fakeRes = {
      setHeader: () => fakeRes,
      getHeader: () => undefined,
      end: () => {},
    } as any;

    await new Promise<void>((resolve) => {
      sessionMiddleware(req, fakeRes, resolve);
    });

    const session = (req as any).session;
    if (!session?.azureAccount || !session?.githubToken) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const githubToken: string = session.githubToken;
    const sessionId: string = session.id;
    let activeBackend: ChatBackend = config.chatBackend;
    let copilotSession: any = null;

    const cleanup = async () => {
      if (copilotSession) {
        try { copilotSession.removeAllListeners?.(); } catch { /* ignore */ }
        copilotSession = null;
      }
      await destroyCopilotClient(sessionId);
    };

    ws.on('close', () => { cleanup(); });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (!msg.type || !VALID_MESSAGE_TYPES.has(msg.type)) {
          send(ws, { type: 'error', message: 'Unknown message type' });
          return;
        }

        switch (msg.type) {
          case 'new_session': {
            activeBackend = (msg.backend === 'cli' || msg.backend === 'gh-cli') ? 'cli' : 'sdk';

            // Destroy previous session before creating a new one
            if (copilotSession) {
              try { copilotSession.removeAllListeners?.(); } catch { /* ignore */ }
              copilotSession = null;
            }

            if (activeBackend === 'cli') {
              // CLI mode: no SDK session needed, just verify gh copilot is available
              try {
                const { ensureGhCopilotAvailable } = await import('../copilot/ghCli.js');
                await ensureGhCopilotAvailable(githubToken);
                send(ws, { type: 'session_created', backend: 'cli' });
              } catch (cliErr: any) {
                send(ws, { type: 'error', message: `CLI not available: ${cliErr.message}` });
              }
              break;
            }

            try {
              if (process.env.DEBUG_COPILOT) console.log(`[WS] Creating Copilot session for user`);
              const client = await getCopilotClient(sessionId, githubToken);
              copilotSession = await createCopilotSession(client, githubToken, msg.model);

              if (process.env.DEBUG_COPILOT) console.log(`[WS] Attaching event listeners to session`);
              copilotSession.on(
                'assistant.message_delta',
                (event: any) => {
                  if (process.env.DEBUG_COPILOT) console.log(`[WS] Received delta chunk:`, event.data.deltaContent.substring(0, 50));
                  send(ws, {
                    type: 'delta',
                    content: event.data.deltaContent,
                  });
                }
              );

              if (process.env.DEBUG_COPILOT) console.log(`[WS] Session created successfully, sending confirmation`);
              send(ws, { type: 'session_created', model: msg.model, backend: activeBackend });
            } catch (sessionErr: any) {
              console.error('Session creation error:', sessionErr.message);
              if (process.env.DEBUG_COPILOT) console.error('[WS] Full error stack:', sessionErr.stack);
              send(ws, {
                type: 'error',
                message: `Failed to create session: ${sessionErr.message}`,
              });
            }
            break;
          }

          case 'message': {
            const content = typeof msg.content === 'string' ? msg.content : '';
            if (!content.trim() || content.length > MAX_MESSAGE_LENGTH) {
              send(ws, { type: 'error', message: `Message must be 1-${MAX_MESSAGE_LENGTH} characters` });
              return;
            }

            if (activeBackend === 'cli') {
              // CLI mode: use gh copilot suggest with the user's GitHub token
              try {
                const output = await runGhCopilotSuggest(content, githubToken);
                send(ws, { type: 'delta', content: output });
                send(ws, { type: 'done' });
              } catch (cliErr: any) {
                send(ws, { type: 'error', message: `CLI error: ${cliErr.message}` });
              }
              break;
            }

            if (!copilotSession) {
              send(ws, { type: 'error', message: 'No active session. Send new_session first.' });
              return;
            }

            if (process.env.DEBUG_COPILOT) console.log(`[WS] Sending message to session:`, content.substring(0, 50));
            await copilotSession.sendAndWait({ prompt: content });
            if (process.env.DEBUG_COPILOT) console.log(`[WS] Message processing complete`);
            send(ws, { type: 'done' });
            break;
          }

          case 'list_models': {
            const client = await getCopilotClient(sessionId, githubToken);
            const models = await getAvailableModels(client);
            // Ensure models is always an array before sending
            const modelArray = Array.isArray(models) ? models : [];
            send(ws, { type: 'models', models: modelArray });
            break;
          }
        }
      } catch (err: any) {
        console.error('WS message error:', err);
        console.error('Error stack:', err.stack);
        send(ws, { type: 'error', message: `An internal error occurred: ${err.message}` });
      }
    });

    ws.on('error', (err) => {
      console.error('WS error:', err.message);
    });

    send(ws, {
      type: 'connected',
      user: session.githubUser?.login,
    });
  });
}
