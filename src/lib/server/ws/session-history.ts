import type { HistoryMessage } from './types.js';

let historyIdCounter = 0;
function historyId(): string {
  return `hist-${Date.now()}-${historyIdCounter++}`;
}

/** Map SDK session events from getMessages() to HistoryMessage[] for the client history. */
export function mapSessionEventsToHistory(events: any[]): HistoryMessage[] {
  const messages: HistoryMessage[] = [];
  for (const event of events) {
    const ts = event.timestamp ? new Date(event.timestamp).getTime() : Date.now();
    switch (event.type) {
      case 'user.message':
        if (event.data?.content) {
          messages.push({ id: historyId(), role: 'user', content: event.data.content, timestamp: ts });
        }
        break;
      case 'assistant.message':
        if (event.data?.content) {
          messages.push({ id: historyId(), role: 'assistant', content: event.data.content, timestamp: ts });
        }
        break;
      case 'assistant.reasoning':
        if (event.data?.content) {
          messages.push({ id: historyId(), role: 'reasoning', content: event.data.content, timestamp: ts });
        }
        break;
      case 'assistant.intent':
        if (event.data?.intent) {
          messages.push({ id: historyId(), role: 'intent', content: event.data.intent, timestamp: ts });
        }
        break;
      case 'tool.execution_start':
        messages.push({
          id: historyId(),
          role: 'tool',
          content: event.data?.toolName ?? 'unknown',
          timestamp: ts,
          toolCallId: event.data?.toolCallId,
          toolName: event.data?.toolName,
          toolStatus: 'complete',
          mcpServerName: event.data?.mcpServerName,
          mcpToolName: event.data?.mcpToolName,
        });
        break;
      case 'subagent.started':
        if (event.data?.agentName) {
          messages.push({
            id: historyId(),
            role: 'subagent',
            content: event.data.description ?? event.data.agentName,
            timestamp: ts,
            agentName: event.data.agentName,
          });
        }
        break;
      case 'session.error':
        if (event.data?.message) {
          messages.push({ id: historyId(), role: 'error', content: event.data.message, timestamp: ts });
        }
        break;
      // Skip ephemeral/streaming events: deltas, usage, turn_start/end, idle, etc.
      default:
        break;
    }
  }
  return messages;
}
