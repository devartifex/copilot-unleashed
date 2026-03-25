import type { SessionMode, ReasoningEffort } from './common.js';
import type { Attachment } from './attachments.js';
import type { InfiniteSessionsConfig, SystemPromptSectionInput } from './config.js';

export type MessageDeliveryMode = 'immediate' | 'enqueue';

export interface NewSessionMessage {
  type: 'new_session';
  model: string;
  mode?: SessionMode;
  reasoningEffort?: ReasoningEffort;
  customInstructions?: string;
  excludedTools?: string[];
  infiniteSessions?: InfiniteSessionsConfig;
  systemPromptSections?: Record<string, SystemPromptSectionInput>;
}

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
