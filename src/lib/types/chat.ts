import type { QuotaSnapshots } from './quota.js';
import type { Attachment } from './attachments.js';

export type ChatMessageRole =
  | 'user'
  | 'assistant'
  | 'tool'
  | 'info'
  | 'warning'
  | 'error'
  | 'intent'
  | 'usage'
  | 'skill'
  | 'subagent'
  | 'fleet'
  | 'reasoning'
  | 'queued';

export interface CopilotUsageItem {
  type: string;
  model?: string;
  tokens?: number;
  premiumRequests?: number;
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  timestamp: number;
  toolCallId?: string;
  toolName?: string;
  toolStatus?: ToolCallStatus;
  toolProgressMessage?: string;
  toolProgressMessages?: string[];
  mcpServerName?: string;
  mcpToolName?: string;
  agentName?: string;
  skillName?: string;
  fleetAgents?: Array<{ agentId: string; agentType: string; status: 'running' | 'completed' | 'failed'; error?: string }>;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  duration?: number;
  cost?: number;
  quotaSnapshots?: QuotaSnapshots;
  copilotUsage?: CopilotUsageItem[];
  attachments?: Attachment[];
}

export type ToolCallStatus = 'running' | 'progress' | 'complete' | 'failed';

export interface ToolCallState {
  id: string;
  name: string;
  mcpServerName?: string;
  mcpToolName?: string;
  status: ToolCallStatus;
  message?: string;
  progressMessages?: string[];
}
