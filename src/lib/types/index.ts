// ─── Shared enums & constants ───────────────────────────────────────────────

export type SessionMode = 'interactive' | 'plan' | 'autopilot';
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';

// ─── Model types ────────────────────────────────────────────────────────────

export interface ModelCapabilities {
  limits?: {
    max_context_window_tokens?: number;
    max_prompt_tokens?: number;
  };
  supports?: {
    vision?: boolean;
    reasoningEffort?: boolean;
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  billing?: { multiplier: number };
  capabilities?: ModelCapabilities;
  defaultReasoningEffort?: ReasoningEffort;
  supportedReasoningEfforts?: string[];
}

// ─── Custom tool definitions ────────────────────────────────────────────────

export interface CustomToolDefinition {
  name: string;
  description: string;
  webhookUrl: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  parameters: Record<string, { type: string; description: string }>;
  skipPermission?: boolean;
}

// ─── Tool / Agent types ─────────────────────────────────────────────────────

export interface McpServerDefinition {
  name: string;
  url: string;
  type: 'http' | 'sse';
  headers: Record<string, string>;
  tools: string[];
  enabled: boolean;
  timeout?: number;
}

export interface ToolInfo {
  name: string;
  namespacedName?: string;
  description?: string;
  mcpServerName?: string;
}

export interface AgentInfo {
  name: string;
  description?: string;
}

// ─── Quota types ────────────────────────────────────────────────────────────

export interface QuotaSnapshot {
  remainingPercentage?: number;
  percentageUsed?: number;
  resetDate?: string;
  usedRequests?: number;
  entitlementRequests?: number;
  overage?: number;
  isUnlimitedEntitlement?: boolean;
}

export type QuotaSnapshots = Record<string, QuotaSnapshot>;

/** Priority order for picking the most relevant quota snapshot */
const QUOTA_PRIORITY = ['copilot_premium', 'premium_requests', 'premium_interactions'] as const;

/** Pick the most relevant quota snapshot: premium types first, then any other key */
export function pickPrimaryQuota(snapshots: QuotaSnapshots | null): { key: string; label: string; snapshot: QuotaSnapshot } | null {
  if (!snapshots) return null;
  const keys = Object.keys(snapshots);
  if (keys.length === 0) return null;

  for (const k of QUOTA_PRIORITY) {
    if (snapshots[k]) return { key: k, label: formatQuotaLabel(k), snapshot: snapshots[k] };
  }
  // Fallback: first available key
  const k = keys[0];
  return { key: k, label: formatQuotaLabel(k), snapshot: snapshots[k] };
}

function formatQuotaLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Session list types ─────────────────────────────────────────────────────

export interface SessionSummary {
  id: string;
  title?: string;
  model?: string;
  updatedAt?: string;
  cwd?: string;
  repository?: string;
  branch?: string;
  checkpointCount?: number;
  hasPlan?: boolean;
  isRemote?: boolean;
  /** Where the session was found: 'sdk' = indexed by Copilot CLI, 'filesystem' = on-disk only (bundled) */
  source?: 'sdk' | 'filesystem';
}

export interface CheckpointEntry {
  number: number;
  title: string;
  filename: string;
}

export interface SessionDetail {
  id: string;
  cwd?: string;
  repository?: string;
  branch?: string;
  summary?: string;
  createdAt?: string;
  updatedAt?: string;
  checkpoints: CheckpointEntry[];
  plan?: string;
  isRemote?: boolean;
}

// ─── Incoming server messages (discriminated union on `type`) ────────────────

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

export interface CopilotUsageItem {
  type: string;
  model?: string;
  tokens?: number;
  premiumRequests?: number;
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

// ─── RPC discovery messages ─────────────────────────────────────────────────

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

// ─── Session filesystem watcher ──────────────────────────────────────────────

export interface SessionsChangedMessage {
  type: 'sessions_changed';
}

// ─── File attachment (upload metadata) ───────────────────────────────────────

export interface FileAttachment {
  path: string;
  name: string;
  size: number;
  type: string;
}

export interface BlobAttachment {
  type: 'blob';
  data: string;
  mimeType: string;
}

// ─── SDK attachment types (file, directory, selection) ───────────────────────

export type Attachment =
  | { type: 'file'; path: string; name: string; displayName?: string }
  | { type: 'directory'; path: string; name: string; displayName?: string }
  | {
      type: 'selection';
      filePath: string;
      name: string;
      displayName: string;
      selection?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
      text?: string;
    };

// ─── Outgoing client messages (discriminated union on `type`) ────────────────

export interface InfiniteSessionsConfig {
  enabled: boolean;
  backgroundThreshold: number;
  bufferThreshold: number;
}

export type { SystemPromptSection, SectionOverride, SectionOverrideAction } from '@github/copilot-sdk';

export interface SystemPromptSectionInput {
  action: 'replace' | 'remove' | 'append' | 'prepend';
  content?: string;
}

export interface NewSessionMessage {
  type: 'new_session';
  model: string;
  mode?: SessionMode;
  reasoningEffort?: ReasoningEffort;
  customInstructions?: string;
  excludedTools?: string[];
  customTools?: CustomToolDefinition[];
  mcpServers?: McpServerDefinition[];
  infiniteSessions?: InfiniteSessionsConfig;
  systemPromptSections?: Record<string, SystemPromptSectionInput>;
}

export type MessageDeliveryMode = 'immediate' | 'enqueue';

export interface SendMessage {
  type: 'message';
  content: string;
  attachments?: Attachment[];
  mode?: MessageDeliveryMode;
}

export interface ListModelsMessage {
  type: 'list_models';
}

export interface SetModeMessage {
  type: 'set_mode';
  mode: SessionMode;
}

export interface AbortClientMessage {
  type: 'abort';
}

export interface SetModelMessage {
  type: 'set_model';
  model: string;
}

export interface SetReasoningMessage {
  type: 'set_reasoning';
  effort: ReasoningEffort;
}

export interface UserInputResponseMessage {
  type: 'user_input_response';
  answer: string;
  wasFreeform: boolean;
}

export interface PermissionResponseMessage {
  type: 'permission_response';
  requestId: string;
  kind: string;
  toolName: string;
  decision: 'allow' | 'deny' | 'always_allow' | 'always_deny';
}

export interface ListToolsMessage {
  type: 'list_tools';
  model?: string;
}

export interface ListAgentsMessage {
  type: 'list_agents';
}

export interface SelectAgentMessage {
  type: 'select_agent';
  name: string;
}

export interface DeselectAgentMessage {
  type: 'deselect_agent';
}

export interface GetQuotaMessage {
  type: 'get_quota';
}

export interface CompactMessage {
  type: 'compact';
}

export interface ListSessionsMessage {
  type: 'list_sessions';
}

export interface ResumeSessionMessage {
  type: 'resume_session';
  sessionId: string;
  mcpServers?: McpServerDefinition[];
}

export interface DeleteSessionMessage {
  type: 'delete_session';
  sessionId: string;
}

export interface GetSessionDetailMessage {
  type: 'get_session_detail';
  sessionId: string;
}

export interface GetPlanMessage {
  type: 'get_plan';
}

export interface UpdatePlanMessage {
  type: 'update_plan';
  content: string;
}

export interface StartFleetMessage {
  type: 'start_fleet';
  prompt: string;
}

export interface DeletePlanMessage {
  type: 'delete_plan';
}

export interface ClearChatMessage {
  type: 'clear_chat';
}

// ─── RPC discovery client messages ──────────────────────────────────────────

export interface ListSkillsRpcMessage {
  type: 'list_skills_rpc';
}

export interface ToggleSkillRpcMessage {
  type: 'toggle_skill_rpc';
  name: string;
  enabled: boolean;
}

export interface ReloadSkillsMessage {
  type: 'reload_skills';
}

export interface ListMcpRpcMessage {
  type: 'list_mcp_rpc';
}

export interface ToggleMcpRpcMessage {
  type: 'toggle_mcp_rpc';
  name: string;
  enabled: boolean;
}

export type ClientMessage =
  | NewSessionMessage
  | SendMessage
  | ListModelsMessage
  | SetModeMessage
  | AbortClientMessage
  | SetModelMessage
  | SetReasoningMessage
  | UserInputResponseMessage
  | PermissionResponseMessage
  | ListToolsMessage
  | ListAgentsMessage
  | SelectAgentMessage
  | DeselectAgentMessage
  | GetQuotaMessage
  | CompactMessage
  | ListSessionsMessage
  | ResumeSessionMessage
  | DeleteSessionMessage
  | GetSessionDetailMessage
  | GetPlanMessage
  | UpdatePlanMessage
  | DeletePlanMessage
  | StartFleetMessage
  | ClearChatMessage
  | ListSkillsRpcMessage
  | ToggleSkillRpcMessage
  | ReloadSkillsMessage
  | ListMcpRpcMessage
  | ToggleMcpRpcMessage
  | ListInstructionsMessage
  | ListPromptsMessage
  | UsePromptMessage;

// ─── Chat message type for rendering ────────────────────────────────────────

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

// ─── Tool call tracking ─────────────────────────────────────────────────────

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

// ─── User input request state ───────────────────────────────────────────────

export interface UserInputState {
  pending: boolean;
  question: string;
  choices?: string[];
  allowFreeform: boolean;
}

// ─── Permission request state ───────────────────────────────────────────────

export interface PermissionRequestState {
  requestId: string;
  kind: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}

// ─── Context info state ─────────────────────────────────────────────────────

export interface ContextInfo {
  tokenLimit: number;
  currentTokens: number;
  messagesLength: number;
}

// ─── Plan state ─────────────────────────────────────────────────────────────

export interface PlanState {
  exists: boolean;
  content: string;
  path?: string;
}

// ─── New session configuration ──────────────────────────────────────────────

export interface NewSessionConfig {
  model: string;
  mode?: SessionMode;
  reasoningEffort?: ReasoningEffort;
  customInstructions?: string;
  excludedTools?: string[];
  customTools?: CustomToolDefinition[];
  mcpServers?: McpServerDefinition[];
  infiniteSessions?: InfiniteSessionsConfig;
  systemPromptSections?: Record<string, SystemPromptSectionInput>;
}

// ─── Settings (persisted to localStorage) ───────────────────────────────────

export interface PersistedSettings {
  model: string;
  mode: SessionMode;
  reasoningEffort: ReasoningEffort;
  additionalInstructions: string;
  excludedTools: string[];
  customTools: CustomToolDefinition[];
  mcpServers?: McpServerDefinition[];
  infiniteSessions?: InfiniteSessionsConfig;
  /** User preference for push notifications — persisted so it survives redeploys. */
  notificationsEnabled?: boolean;
}

// ─── Custom agent definitions ───────────────────────────────────────────────

export interface CustomAgentDefinition {
  name: string;
  displayName?: string;
  description?: string;
  tools?: string[];
  prompt: string;
}

// ─── Skill definitions ──────────────────────────────────────────────────────

export interface SkillDefinition {
  name: string;
  description: string;
  directory: string;
  license?: string;
  allowedTools?: string;
}

// ─── Customization source types ─────────────────────────────────────────────

export type CustomizationSource = 'builtin' | 'user' | 'repo';

/** Normalize SDK source strings to our standard labels */
export function normalizeSource(sdkSource: string | undefined): CustomizationSource {
  if (!sdkSource) return 'builtin';
  const s = sdkSource.toLowerCase();
  if (s === 'personal' || s === 'user') return 'user';
  if (s === 'project' || s === 'workspace' || s === 'repo') return 'repo';
  return 'builtin';
}

// ─── Source-labeled item types (for settings UI) ────────────────────────────

export interface SourcedAgentInfo {
  name: string;
  displayName?: string;
  description?: string;
  source: CustomizationSource;
  isSelected: boolean;
}

export interface SourcedSkillInfo {
  name: string;
  description: string;
  source: CustomizationSource;
  enabled: boolean;
  userInvocable?: boolean;
  path?: string;
}

export interface SourcedMcpServerInfo {
  name: string;
  source: CustomizationSource;
  status: string;
  error?: string;
}

export interface InstructionInfo {
  name: string;
  source: CustomizationSource;
  path: string;
  description?: string;
  applyTo?: string;
}

export interface PromptInfo {
  name: string;
  source: CustomizationSource;
  path: string;
  description: string;
  content: string;
}

// ─── New server→client messages for customizations ──────────────────────────

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

// ─── New client→server messages for customizations ──────────────────────────

export interface ListInstructionsMessage {
  type: 'list_instructions';
}

export interface ListPromptsMessage {
  type: 'list_prompts';
}

export interface UsePromptMessage {
  type: 'use_prompt';
  name: string;
}
