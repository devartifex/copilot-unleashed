import type {
  Attachment,
  ConnectionState,
  SessionMode,
  ReasoningEffort,
  ClientMessage,
  ServerMessage,
  NewSessionConfig,
  MessageDeliveryMode,
  McpServerDefinition,
} from '$lib/types/index.js';
import { notify } from '$lib/utils/notifications.js';
import { getPushSubscription } from '$lib/utils/push-notifications.js';

const INITIAL_RECONNECT_DELAY = 3000;
const MAX_RECONNECT_DELAY = 60_000;
const UNAUTHORIZED_CODE = 4001;
const REPLACED_CODE = 4002;
const EVICTED_CODE = 4003;
const RECONNECT_DEBOUNCE_MS = 500;
const HEARTBEAT_INTERVAL = 25_000;
const HEARTBEAT_TIMEOUT = 5_000;

// Unique ID for this browser tab — persisted in localStorage so closing and
// reopening the tab can resume the server-side pool entry (session + chat state).
// Note: Chrome/Edge can sync localStorage across devices when browser sync is
// enabled, but that only causes collisions when the SAME browser is used on both
// devices. Different browsers (e.g. Edge on desktop, Safari PWA on iOS) have
// independent localStorage and are unaffected.
const TAB_ID = typeof localStorage !== 'undefined'
  ? localStorage.getItem('copilot-tab-id') ?? (() => {
      const id = crypto.randomUUID();
      localStorage.setItem('copilot-tab-id', id);
      return id;
    })()
  : crypto.randomUUID();

export interface WsStore {
  readonly connectionState: ConnectionState;
  readonly sessionReady: boolean;

  connect(): void;
  disconnect(): void;
  onMessage(handler: (msg: ServerMessage) => void): () => void;

  send(data: ClientMessage): void;

  // Typed send helpers
  sendMessage(
    content: string,
    attachments?: Attachment[],
    mode?: MessageDeliveryMode,
  ): void;
  newSession(config: NewSessionConfig): void;
  resumeSession(sessionId: string, mcpServers?: McpServerDefinition[]): void;
  setMode(mode: SessionMode): void;
  setModel(model: string): void;
  setReasoning(effort: ReasoningEffort): void;
  abort(): void;
  compact(): void;
  listModels(): void;
  listTools(model?: string): void;
  listAgents(): void;
  listSessions(): void;
  selectAgent(name: string): void;
  deselectAgent(): void;
  deleteSession(sessionId: string): void;
  getSessionDetail(sessionId: string): void;
  getQuota(): void;
  getPlan(): void;
  updatePlan(content: string): void;
  deletePlan(): void;
  respondToUserInput(answer: string, wasFreeform: boolean): void;
  respondToPermission(requestId: string, kind: string, toolName: string, decision: 'allow' | 'deny' | 'always_allow' | 'always_deny'): void;
}

export function createWsStore(): WsStore {
  let connectionState = $state<ConnectionState>('disconnected');
  let sessionReady = $state(false);
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = INITIAL_RECONNECT_DELAY;
  let messageHandlers: Array<(msg: ServerMessage) => void> = [];
  let visibilityCleanup: (() => void) | null = null;
  let onlineCleanup: (() => void) | null = null;
  let lastConnectAttempt = 0;
  let hasConnectedOnce = false;
  let reconnectPending = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastSeq = -1;

  // ── Internal helpers ────────────────────────────────────────────────────

  function send(msg: ClientMessage): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function dispatchMessage(msg: ServerMessage): void {
    // Track session readiness from protocol messages
    if (msg.type === 'session_created' || msg.type === 'session_resumed') {
      sessionReady = true;
    }
    if (msg.type === 'session_reconnected') {
      sessionReady = msg.hasSession;
    }

    for (const handler of messageHandlers) {
      handler(msg);
    }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect(): void {
    clearReconnectTimer();

    // Don't reconnect while tab is hidden — save battery on mobile
    if (typeof document !== 'undefined' && document.hidden) {
      reconnectPending = true;
      connectionState = 'reconnecting';
      return;
    }

    connectionState = 'reconnecting';
    // Add ±25% jitter to prevent thundering herd on server restart
    const jitter = reconnectDelay * (0.75 + Math.random() * 0.5);
    reconnectTimer = setTimeout(() => connect(), jitter);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }

  function buildWsUrl(): string {
    if (typeof window === 'undefined') return '';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws?tabId=${TAB_ID}`;
  }

  function setupVisibilityHandler(): void {
    if (typeof document === 'undefined' || visibilityCleanup) return;

    const handler = () => {
      if (!document.hidden && (!ws || ws.readyState !== WebSocket.OPEN)) {
        clearReconnectTimer();
        reconnectDelay = INITIAL_RECONNECT_DELAY;
        reconnectPending = false;
        connect();
      }
    };
    document.addEventListener('visibilitychange', handler);
    visibilityCleanup = () => document.removeEventListener('visibilitychange', handler);
  }

  function setupOnlineHandler(): void {
    if (typeof window === 'undefined' || onlineCleanup) return;

    const handler = () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        clearReconnectTimer();
        reconnectDelay = INITIAL_RECONNECT_DELAY;
        reconnectPending = false;
        connect();
      }
    };
    window.addEventListener('online', handler);
    onlineCleanup = () => window.removeEventListener('online', handler);
  }

  function clearHeartbeat(): void {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (heartbeatTimeout !== null) {
      clearTimeout(heartbeatTimeout);
      heartbeatTimeout = null;
    }
  }

  function startHeartbeat(): void {
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
        heartbeatTimeout = setTimeout(() => {
          // No pong received — connection is silently dead
          console.log('[WS-STORE] Heartbeat timeout — forcing reconnect');
          if (ws) {
            ws.onclose = null;
            try { ws.close(); } catch { /* ignore */ }
            ws = null;
          }
          connectionState = 'disconnected';
          sessionReady = false;
          scheduleReconnect();
        }, HEARTBEAT_TIMEOUT);
      }
    }, HEARTBEAT_INTERVAL);
  }

  // ── Connection lifecycle ────────────────────────────────────────────────

  /** Fire-and-forget: re-register the browser's push subscription with the server.
   *  Called on every WS connect so the server recovers subscriptions lost on redeploy
   *  (EmptyDir volumes are wiped when the container replica is replaced).
   *  Retries once after a short delay to handle auth cookie restoration race. */
  async function reRegisterPushSubscription(): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const sub = await getPushSubscription();
        if (!sub) return;
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        });
        if (res.ok) return;
        // 401 on first attempt: auth cookie may still be restoring — retry after delay
        if (res.status === 401 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        console.warn(`[PUSH] Re-registration failed: ${res.status}`);
        return;
      } catch {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        // Non-fatal — push will self-heal on the next connect
      }
    }
  }

  function connect(): void {
    if (typeof window === 'undefined') return;

    // Debounce guard — prevent double-connect from visibility + online firing together
    const now = Date.now();
    if (now - lastConnectAttempt < RECONNECT_DEBOUNCE_MS) return;
    lastConnectAttempt = now;

    console.log(`[WS-STORE] connect() called, existing ws=${!!ws}, readyState=${ws?.readyState}`);

    // Close existing connection without triggering reconnect logic
    if (ws) {
      console.log('[WS-STORE] Closing existing connection before reconnect');
      ws.onclose = null;
      try { ws.close(); } catch { /* ignore */ }
      ws = null;
    }
    clearHeartbeat();

    connectionState = hasConnectedOnce ? 'reconnecting' : 'connecting';
    const url = buildWsUrl() + (lastSeq >= 0 ? `&lastSeq=${lastSeq}` : '');
    const socket = new WebSocket(url);

    socket.onopen = () => {
      console.log(`[WS-STORE] WebSocket connected`);
      connectionState = 'connected';
      reconnectDelay = INITIAL_RECONNECT_DELAY;
      hasConnectedOnce = true;
      clearReconnectTimer();
      startHeartbeat();
      // Re-register push subscription after every connect/reconnect so the server
      // always has it — EmptyDir storage is wiped on redeploy.
      reRegisterPushSubscription();
    };

    socket.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        // Reset heartbeat timeout on any message from server
        if (heartbeatTimeout !== null) {
          clearTimeout(heartbeatTimeout);
          heartbeatTimeout = null;
        }
        if (msg.type === 'pong') return;
        // Track sequence numbers for replay-on-reconnect
        if (typeof (msg as any).seq === 'number') {
          lastSeq = (msg as any).seq;
        }
        console.log(`[WS-STORE] Received message: type=${msg.type}`);
        dispatchMessage(msg);
      } catch {
        console.error('WS: failed to parse message');
      }
    };

    socket.onclose = (event: CloseEvent) => {
      console.log(`[WS-STORE] WebSocket closed code=${event.code} reason=${event.reason}`);
      connectionState = 'disconnected';
      sessionReady = false;
      ws = null;

      if (event.code === UNAUTHORIZED_CODE) {
        // Hit the logout endpoint to clear the __copilot_auth cookie before
        // reloading. Without this, the cookie restores the revoked token on
        // reload and the user gets stuck in an auth loop instead of seeing
        // the login screen.
        fetch('/auth/logout', { method: 'POST' })
          .finally(() => window.location.reload());
        return;
      }

      // 4002 = replaced by a newer connection we opened — don't reconnect
      // (the newer socket is already active)
      if (event.code === REPLACED_CODE) {
        return;
      }

      // 4003 = session evicted (too many sessions) — reconnect after a delay
      // so the evicted pool entry is fully cleaned up server-side
      if (event.code === EVICTED_CODE) {
        notify('Session evicted — too many active sessions. Reconnecting…', {
          tag: 'session-evicted',
        });
        scheduleReconnect();
        return;
      }

      notify('Session disconnected — trying to reconnect…', {
        tag: 'session-disconnected',
      });
      scheduleReconnect();
    };

    socket.onerror = () => {
      console.error(`[WS-STORE] WebSocket error`);
      connectionState = 'error';
    };

    ws = socket;
    setupVisibilityHandler();
    setupOnlineHandler();
  }

  function disconnect(): void {
    console.log(`[WS-STORE] disconnect() called, ws=${!!ws}`);
    clearReconnectTimer();
    clearHeartbeat();
    if (visibilityCleanup) {
      visibilityCleanup();
      visibilityCleanup = null;
    }
    if (onlineCleanup) {
      onlineCleanup();
      onlineCleanup = null;
    }
    if (ws) {
      ws.onclose = null; // prevent onclose from scheduling a reconnect
      try { ws.close(); } catch { /* ignore */ }
      ws = null;
    }
    connectionState = 'disconnected';
    sessionReady = false;
    reconnectPending = false;
  }

  // ── Message subscription ────────────────────────────────────────────────

  function onMessage(handler: (msg: ServerMessage) => void): () => void {
    messageHandlers.push(handler);
    return () => {
      messageHandlers = messageHandlers.filter((h) => h !== handler);
    };
  }

  // ── Typed send functions ────────────────────────────────────────────────

  function sendMessage(
    content: string,
    attachments?: Attachment[],
    mode?: MessageDeliveryMode,
  ): void {
    send({
      type: 'message',
      content,
      ...(attachments?.length ? { attachments } : {}),
      ...(mode ? { mode } : {}),
    });
  }

  function newSession(config: NewSessionConfig): void {
    sessionReady = false;
    const msg: ClientMessage = {
      type: 'new_session',
      model: config.model,
      ...(config.mode && { mode: config.mode }),
      ...(config.reasoningEffort && { reasoningEffort: config.reasoningEffort }),
      ...(config.customInstructions?.trim() && { customInstructions: config.customInstructions.trim() }),
      ...(config.excludedTools?.length && { excludedTools: config.excludedTools }),
      ...(config.customTools?.length && { customTools: config.customTools }),
      ...(config.customAgents?.length && { customAgents: config.customAgents }),
      ...(config.mcpServers?.length && { mcpServers: config.mcpServers }),
      ...(config.disabledSkills?.length && { disabledSkills: config.disabledSkills }),
      ...(config.infiniteSessions && { infiniteSessions: config.infiniteSessions }),
    };
    send(msg);
  }

  function resumeSession(sessionId: string, mcpServers?: McpServerDefinition[]): void {
    sessionReady = false;
    const enabledServers = mcpServers?.filter(s => s.enabled);
    send({
      type: 'resume_session',
      sessionId,
      ...(enabledServers?.length && { mcpServers: enabledServers }),
    });
  }

  function setMode(mode: SessionMode): void {
    send({ type: 'set_mode', mode });
  }

  function setModel(model: string): void {
    send({ type: 'set_model', model });
  }

  function setReasoning(effort: ReasoningEffort): void {
    send({ type: 'set_reasoning', effort });
  }

  function abort(): void {
    send({ type: 'abort' });
  }

  function compact(): void {
    send({ type: 'compact' });
  }

  function listModels(): void {
    send({ type: 'list_models' });
  }

  function listTools(model?: string): void {
    const msg: ClientMessage = model
      ? { type: 'list_tools', model }
      : { type: 'list_tools' };
    send(msg);
  }

  function listAgents(): void {
    send({ type: 'list_agents' });
  }

  function listSessions(): void {
    send({ type: 'list_sessions' });
  }

  function deleteSession(sessionId: string): void {
    send({ type: 'delete_session', sessionId });
  }

  function getSessionDetail(sessionId: string): void {
    send({ type: 'get_session_detail', sessionId });
  }

  function selectAgent(name: string): void {
    send({ type: 'select_agent', name });
  }

  function deselectAgent(): void {
    send({ type: 'deselect_agent' });
  }

  function getQuota(): void {
    send({ type: 'get_quota' });
  }

  function getPlan(): void {
    send({ type: 'get_plan' });
  }

  function updatePlan(content: string): void {
    send({ type: 'update_plan', content });
  }

  function deletePlan(): void {
    send({ type: 'delete_plan' });
  }

  function respondToUserInput(answer: string, wasFreeform: boolean): void {
    send({ type: 'user_input_response', answer, wasFreeform });
  }

  function respondToPermission(requestId: string, kind: string, toolName: string, decision: 'allow' | 'deny' | 'always_allow' | 'always_deny'): void {
    send({ type: 'permission_response', requestId, kind, toolName, decision });
  }

  // ── Return public interface ─────────────────────────────────────────────

  return {
    get connectionState() { return connectionState; },
    get sessionReady() { return sessionReady; },

    connect,
    disconnect,
    onMessage,

    send,
    sendMessage,
    newSession,
    resumeSession,
    setMode,
    setModel,
    setReasoning,
    abort,
    compact,
    listModels,
    listTools,
    listAgents,
    listSessions,
    deleteSession,
    getSessionDetail,
    selectAgent,
    deselectAgent,
    getQuota,
    getPlan,
    updatePlan,
    deletePlan,
    respondToUserInput,
    respondToPermission,
  };
}
