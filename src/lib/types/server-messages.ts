import type { SessionMode, ReasoningEffort } from './common.js';
import type { ModelInfo } from './models.js';
import type { ToolInfo } from './tools.js';
import type { QuotaSnapshots } from './quota.js';
import type { SessionSummary, SessionDetail } from './sessions.js';
import type { ChatMessage, CopilotUsageItem } from './chat.js';
import type { CustomizationSource, SourcedAgentInfo, InstructionInfo, PromptInfo } from './customizations.js';

export interface ConnectedMessage {
  type: 'connected';
  user: string;
  sdkSessionId?: string | null;
  hasPersistedState?: boolean;
}

export interface ColdResumeMessage {
  type: 'cold_resume';
  messages: Array<Record<string, unknown>>;
  model: string;
  mode: string;
  sdkSessionId: string | null;
}

export interface SessionCreatedMessage {
  type: 'session_created';
  model: string;
  sessionId?: string;
}

export interface SessionReconnectedMessage {
  type: 'session_reconnected';
  user: string;
  hasSession: boolean;
  isProcessing?: boolean;
}

export interface TurnStartMessage {
  type: 'turn_start';
}

export interface DeltaMessage {
  type: 'delta';
  content: string;
}

export interface TurnEndMessage {
  type: 'turn_end';
  /** True when this message was replayed from the server buffer after reconnecting. */
  replayed?: boolean;
}

export interface DoneMessage {
  type: 'done';
  /** True when this message was replayed from the server buffer after reconnecting. */
  replayed?: boolean;
}

export interface ReasoningDeltaMessage {
  type: 'reasoning_delta';
  content: string;
  reasoningId: string;
}

export interface ReasoningDoneMessage {
  type: 'reasoning_done';
  reasoningId: string;
  content?: string;
}

export interface IntentMessage {
  type: 'intent';
  intent: string;
}

export interface ToolStartMessage {
  type: 'tool_start';
  toolCallId: string;
  toolName: string;
  mcpServerName?: string;
  mcpToolName?: string;
}

export interface ToolProgressMessage {
  type: 'tool_progress';
  toolCallId: string;
  message: string;
}

export interface ToolEndMessage {
  type: 'tool_end';
  toolCallId: string;
}

export interface ModelsMessage {
  type: 'models';
  models: (ModelInfo | string)[];
}

export interface ModeChangedMessage {
  type: 'mode_changed';
  mode: SessionMode;
}

export interface ModelChangedMessage {
  type: 'model_changed';
  model: string;
  source?: 'sdk' | string;
}

export interface TitleChangedMessage {
  type: 'title_changed';
  title: string;
}

export interface UsageMessage {
  type: 'usage';
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  duration?: number;
  cost?: number;
  quotaSnapshots?: QuotaSnapshots;
  copilotUsage?: CopilotUsageItem[];
}

export interface WarningMessage {
  type: 'warning';
  message: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface AbortedMessage {
  type: 'aborted';
}

export interface UserInputRequestMessage {
  type: 'user_input_request';
  question: string;
  choices?: string[];
  allowFreeform: boolean;
}

export interface PermissionRequestMessage {
  type: 'permission_request';
  requestId: string;
  kind: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}

export interface ToolsMessage {
  type: 'tools';
  tools: ToolInfo[];
}

export interface AgentsMessage {
  type: 'agents';
  agents: SourcedAgentInfo[];
  current: string | null;
}

export interface AgentChangedMessage {
  type: 'agent_changed';
  agent: string | null;
}

export interface QuotaMessage {
  type: 'quota';
  quotaSnapshots?: QuotaSnapshots;
}

export interface SessionsMessage {
  type: 'sessions';
  sessions: SessionSummary[];
}

export interface SessionDetailMessage {
  type: 'session_detail';
  detail: SessionDetail;
}

export interface SessionHistoryMessage {
  type: 'session_history';
  messages: ChatMessage[];
}

export interface SessionResumedMessage {
  type: 'session_resumed';
  sessionId: string;
}

export interface SessionDeletedMessage {
  type: 'session_deleted';
  sessionId: string;
}

export interface PlanMessage {
  type: 'plan';
  exists: boolean;
  content?: string;
  path?: string;
}

export interface PlanChangedMessage {
  type: 'plan_changed';
  content?: string;
  path?: string;
}

export interface PlanUpdatedMessage {
  type: 'plan_updated';
  content?: string;
  path?: string;
}

export interface PlanDeletedMessage {
  type: 'plan_deleted';
}

export interface CompactionStartMessage {
  type: 'compaction_start';
}

export interface CompactionCompleteMessage {
  type: 'compaction_complete';
  tokensRemoved?: number;
  messagesRemoved?: number;
  preCompactionTokens?: number;
  postCompactionTokens?: number;
}

export interface CompactionResultMessage {
  type: 'compaction_result';
  tokensRemoved?: number;
  messagesRemoved?: number;
}

export interface SkillInvokedMessage {
  type: 'skill_invoked';
  skillName: string;
}

export interface SubagentStartMessage {
  type: 'subagent_start';
  agentName: string;
  description?: string;
}

export interface SubagentEndMessage {
  type: 'subagent_end';
  agentName: string;
}

export interface SubagentFailedMessage {
  type: 'subagent_failed';
  agentName?: string;
  error?: string;
}

export interface SubagentSelectedMessage {
  type: 'subagent_selected';
  agentName: string;
}

export interface SubagentDeselectedMessage {
  type: 'subagent_deselected';
  agentName?: string;
}

export interface InfoMessage {
  type: 'info';
  message: string;
}

export interface ElicitationRequestedMessage {
  type: 'elicitation_requested';
  question: string;
  choices?: string[];
  allowFreeform: boolean;
}

export interface ElicitationCompletedMessage {
  type: 'elicitation_completed';
  answer?: string;
}

export interface ExitPlanModeRequestedMessage {
  type: 'exit_plan_mode_requested';
}

export interface ExitPlanModeCompletedMessage {
  type: 'exit_plan_mode_completed';
}

export interface ContextInfoMessage {
  type: 'context_info';
  tokenLimit: number;
  currentTokens: number;
  messagesLength: number;
}

export interface ReasoningChangedMessage {
  type: 'reasoning_changed';
  effort: ReasoningEffort;
}

export interface SessionShutdownMessage {
  type: 'session_shutdown';
  totalPremiumRequests?: number;
  totalApiDurationMs?: number;
  sessionStartTime?: string;
}

export interface SessionIdleMessage {
  type: 'session_idle';
  backgroundTasks?: {
    agents: Array<{ agentId: string; agentType: string }>;
  };
}

export interface TaskCompleteMessage {
  type: 'task_complete';
  summary?: string;
}

export interface TruncationMessage {
  type: 'truncation';
  tokenLimit: number;
  preTruncationTokens: number;
  preTruncationMessages: number;
  postTruncationTokens: number;
  postTruncationMessages: number;
}

export interface ToolPartialResultMessage {
  type: 'tool_partial_result';
  toolCallId: string;
  partialOutput: string;
}

export interface ContextChangedMessage {
  type: 'context_changed';
  cwd: string;
  gitRoot?: string;
  repository?: string;
  branch?: string;
}

export interface WorkspaceFileChangedMessage {
  type: 'workspace_file_changed';
  path: string;
  operation: 'create' | 'update';
}

export interface FleetStartedMessage {
  type: 'fleet_started';
  started: boolean;
}

export interface FleetStatusMessage {
  type: 'fleet_status';
  agents: Array<{ agentId: string; agentType: string }>;
}

export interface SystemNotificationMessage {
  type: 'system_notification';
  content?: string;
  kind?: Record<string, unknown>;
}

export interface HookPreToolMessage {
  type: 'hook_pre_tool';
  toolName: string;
  toolArgs?: unknown;
}

export interface HookPostToolMessage {
  type: 'hook_post_tool';
  toolName: string;
  toolArgs?: unknown;
}

export interface HookSessionStartMessage {
  type: 'hook_session_start';
  source: string;
}

export interface HookSessionEndMessage {
  type: 'hook_session_end';
  reason: string;
}

export interface HookUserPromptMessage {
  type: 'hook_user_prompt';
  prompt: string;
}

export interface HookErrorMessage {
  type: 'hook_error';
  error: string;
  errorContext: string;
  recoverable: boolean;
}

export type HookMessage =
  | HookPreToolMessage
  | HookPostToolMessage
  | HookUserPromptMessage
  | HookSessionStartMessage
  | HookSessionEndMessage
  | HookErrorMessage;

export interface SessionUsageTotals {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
  totalDurationMs: number;
  apiCalls: number;
  premiumRequests: number;
}

/** Server heartbeat response to client-side ping */
export interface PongMessage {
  type: 'pong';
}

export interface SkillsListMessage {
  type: 'skills_list';
  skills: {
    name: string;
    description: string;
    source: CustomizationSource;
    userInvocable: boolean;
    enabled: boolean;
    path?: string;
  }[];
}

export interface SkillToggledMessage {
  type: 'skill_toggled';
  name: string;
  enabled: boolean;
}

export interface SkillsReloadedMessage {
  type: 'skills_reloaded';
}

export interface McpServersListMessage {
  type: 'mcp_servers_list';
  servers: {
    name: string;
    status: 'connected' | 'failed' | 'pending' | 'disabled' | 'not_configured';
    source?: string;
    error?: string;
  }[];
}

export interface McpServerToggledMessage {
  type: 'mcp_server_toggled';
  name: string;
  enabled: boolean;
}

export interface SessionsChangedMessage {
  type: 'sessions_changed';
}

export interface InstructionsListMessage {
  type: 'instructions_list';
  instructions: InstructionInfo[];
}

export interface PromptsListMessage {
  type: 'prompts_list';
  prompts: PromptInfo[];
}

export interface PromptContentMessage {
  type: 'prompt_content';
  name: string;
  content: string;
}

export type ServerMessage =
  | ConnectedMessage
  | ColdResumeMessage
  | SessionCreatedMessage
  | SessionReconnectedMessage
  | TurnStartMessage
  | DeltaMessage
  | TurnEndMessage
  | DoneMessage
  | ReasoningDeltaMessage
  | ReasoningDoneMessage
  | IntentMessage
  | ToolStartMessage
  | ToolProgressMessage
  | ToolEndMessage
  | ModelsMessage
  | ModeChangedMessage
  | ModelChangedMessage
  | TitleChangedMessage
  | UsageMessage
  | WarningMessage
  | ErrorMessage
  | AbortedMessage
  | UserInputRequestMessage
  | PermissionRequestMessage
  | ToolsMessage
  | AgentsMessage
  | AgentChangedMessage
  | QuotaMessage
  | SessionsMessage
  | SessionDetailMessage
  | SessionHistoryMessage
  | SessionResumedMessage
  | SessionDeletedMessage
  | PlanMessage
  | PlanChangedMessage
  | PlanUpdatedMessage
  | PlanDeletedMessage
  | CompactionStartMessage
  | CompactionCompleteMessage
  | CompactionResultMessage
  | SkillInvokedMessage
  | SubagentStartMessage
  | SubagentEndMessage
  | SubagentFailedMessage
  | SubagentSelectedMessage
  | SubagentDeselectedMessage
  | InfoMessage
  | ElicitationRequestedMessage
  | ElicitationCompletedMessage
  | ExitPlanModeRequestedMessage
  | ExitPlanModeCompletedMessage
  | ContextInfoMessage
  | ReasoningChangedMessage
  | SessionShutdownMessage
  | SessionIdleMessage
  | TaskCompleteMessage
  | TruncationMessage
  | ToolPartialResultMessage
  | ContextChangedMessage
  | WorkspaceFileChangedMessage
  | FleetStartedMessage
  | FleetStatusMessage
  | SystemNotificationMessage
  | HookPreToolMessage
  | HookPostToolMessage
  | HookUserPromptMessage
  | HookSessionStartMessage
  | HookSessionEndMessage
  | HookErrorMessage
  | PongMessage
  | SkillsListMessage
  | SkillToggledMessage
  | SkillsReloadedMessage
  | McpServersListMessage
  | McpServerToggledMessage
  | SessionsChangedMessage
  | InstructionsListMessage
  | PromptsListMessage
  | PromptContentMessage;
