export type SessionMiddleware = (req: any, res: any, next: (err?: any) => void) => void;

/** Minimal ChatMessage shape for session history reconstruction (mirrors src/lib/types/index.ts) */
export interface HistoryMessage {
  id: string;
  role: string;
  content: string;
  timestamp: number;
  toolCallId?: string;
  toolName?: string;
  toolStatus?: string;
  mcpServerName?: string;
  mcpToolName?: string;
  agentName?: string;
}
