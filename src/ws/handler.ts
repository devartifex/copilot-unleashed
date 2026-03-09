import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { createCopilotClient } from '../copilot/client.js';
import { createCopilotSession, getAvailableModels } from '../copilot/session.js';
import { config } from '../config.js';
import { logSecurity } from '../security-log.js';

type SessionMiddleware = (req: any, res: any, next: () => void) => void;

const MAX_MESSAGE_LENGTH = 10_000;
const VALID_MESSAGE_TYPES = new Set(['new_session', 'message', 'list_models', 'set_mode']);
const VALID_MODES = new Set(['interactive', 'plan', 'autopilot']);

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
    // Validate WebSocket origin
    const origin = req.headers.origin;
    if (origin && !config.isDev) {
      const baseOrigin = new URL(config.baseUrl).origin;
      if (origin !== baseOrigin) {
        logSecurity('warn', 'ws_forbidden_origin', { origin, expected: baseOrigin });
        ws.close(1008, 'Forbidden origin');
        return;
      }
    }

    // Extract Express session from the upgrade request
    await new Promise<void>((resolve) => {
      sessionMiddleware(req, {} as any, resolve);
    });

    const session = (req as any).session;
    if (!session?.githubToken) {
      logSecurity('warn', 'ws_unauthorized', { ip: req.socket.remoteAddress });
      ws.close(4001, 'Unauthorized');
      return;
    }

    // Token freshness check for WebSocket connections
    const authTime = session.githubAuthTime;
    if (authTime && Date.now() - authTime > config.tokenMaxAge) {
      logSecurity('info', 'ws_token_expired', { user: session.githubUser?.login });
      ws.close(4001, 'Session expired');
      return;
    }

    const githubToken: string = session.githubToken;
    const client = createCopilotClient(githubToken);
    let copilotSession: any = null;

    const cleanup = async () => {
      if (copilotSession) {
        try { copilotSession.removeAllListeners?.(); } catch { /* ignore */ }
        copilotSession = null;
      }
      try { await client.stop(); } catch { /* ignore */ }
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
            if (copilotSession) {
              try { copilotSession.removeAllListeners?.(); } catch { /* ignore */ }
              copilotSession = null;
            }

            try {
              copilotSession = await createCopilotSession(client, githubToken, msg.model);

              copilotSession.on(
                'assistant.message_delta',
                (event: any) => {
                  send(ws, {
                    type: 'delta',
                    content: event.data.deltaContent,
                  });
                }
              );

              copilotSession.on(
                'assistant.reasoning_delta',
                (event: any) => {
                  send(ws, {
                    type: 'reasoning_delta',
                    content: event.data.deltaContent,
                    reasoningId: event.data.reasoningId,
                  });
                }
              );

              copilotSession.on(
                'assistant.reasoning',
                (event: any) => {
                  send(ws, {
                    type: 'reasoning_done',
                    reasoningId: event.data.reasoningId,
                  });
                }
              );

              copilotSession.on(
                'assistant.intent',
                (event: any) => {
                  send(ws, {
                    type: 'intent',
                    intent: event.data.intent,
                  });
                }
              );

              copilotSession.on(
                'assistant.turn_start',
                () => {
                  send(ws, { type: 'turn_start' });
                }
              );

              copilotSession.on(
                'assistant.turn_end',
                () => {
                  send(ws, { type: 'turn_end' });
                }
              );

              copilotSession.on(
                'tool.execution_start',
                (event: any) => {
                  send(ws, {
                    type: 'tool_start',
                    toolCallId: event.data.toolCallId,
                    toolName: event.data.toolName,
                    mcpServerName: event.data.mcpServerName,
                    mcpToolName: event.data.mcpToolName,
                  });
                }
              );

              copilotSession.on(
                'tool.execution_complete',
                (event: any) => {
                  send(ws, {
                    type: 'tool_end',
                    toolCallId: event.data.toolCallId,
                  });
                }
              );

              copilotSession.on(
                'tool.execution_progress',
                (event: any) => {
                  send(ws, {
                    type: 'tool_progress',
                    toolCallId: event.data.toolCallId,
                    message: event.data.message,
                  });
                }
              );

              copilotSession.on(
                'session.mode_changed',
                (event: any) => {
                  send(ws, {
                    type: 'mode_changed',
                    mode: event.data.newMode,
                  });
                }
              );

              send(ws, { type: 'session_created', model: msg.model });
            } catch (err: any) {
              console.error('Session creation error:', err.message);
              send(ws, {
                type: 'error',
                message: `Failed to create session: ${err.message}`,
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

            if (!copilotSession) {
              send(ws, { type: 'error', message: 'No active session. Send new_session first.' });
              return;
            }

            await copilotSession.sendAndWait({ prompt: content });
            send(ws, { type: 'done' });
            break;
          }

          case 'list_models': {
            const models = await getAvailableModels(client);
            const modelArray = Array.isArray(models) ? models : [];
            send(ws, { type: 'models', models: modelArray });
            break;
          }

          case 'set_mode': {
            const mode = msg.mode;
            if (!mode || !VALID_MODES.has(mode)) {
              send(ws, { type: 'error', message: 'Invalid mode. Use: interactive, plan, or autopilot' });
              return;
            }

            if (!copilotSession) {
              send(ws, { type: 'error', message: 'No active session. Send new_session first.' });
              return;
            }

            try {
              const result = await copilotSession.rpc.mode.set({ mode });
              send(ws, { type: 'mode_changed', mode: result.mode });
            } catch (err: any) {
              console.error('Mode switch error:', err.message);
              send(ws, { type: 'error', message: `Failed to switch mode: ${err.message}` });
            }
            break;
          }
        }
      } catch (err: any) {
        console.error('WS message error:', err.message);
        send(ws, { type: 'error', message: 'An internal error occurred' });
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
