import type { MessageContext } from '../types.js';
import { handleNewSession } from './new-session.js';
import { handleChat } from './chat.js';
import { handleSetMode, handleAbort, handleSetModel, handleSetReasoning } from './mode-model.js';
import { handleUserInputResponse, handlePermissionResponse } from './interactive.js';
import { handleListTools, handleListAgents, handleSelectAgent, handleDeselectAgent } from './tools-agents.js';
import { handleGetQuota, handleCompact } from './quota-compact.js';
import { handleListSessions, handleDeleteSession, handleGetSessionDetail, handleListModels } from './session-management.js';
import { handleResumeSession } from './resume-session.js';
import { handleGetPlan, handleUpdatePlan, handleDeletePlan } from './plans.js';
import { handleStartFleet } from './fleet.js';
import { handleListSkillsRpc, handleToggleSkillRpc, handleReloadSkills, handleListMcpRpc, handleToggleMcpRpc, handleListInstructions, handleListPrompts, handleUsePrompt } from './rpc-discovery.js';
import { chatStateStore } from '../../chat-state-singleton.js';

export const messageHandlers: Record<string, (msg: any, ctx: MessageContext) => Promise<void>> = {
  new_session: handleNewSession,
  message: handleChat,
  list_models: handleListModels,
  set_mode: handleSetMode,
  abort: handleAbort,
  set_model: handleSetModel,
  set_reasoning: handleSetReasoning,
  user_input_response: handleUserInputResponse,
  permission_response: handlePermissionResponse,
  list_tools: handleListTools,
  list_agents: handleListAgents,
  select_agent: handleSelectAgent,
  deselect_agent: handleDeselectAgent,
  get_quota: handleGetQuota,
  compact: handleCompact,
  list_sessions: handleListSessions,
  resume_session: handleResumeSession,
  delete_session: handleDeleteSession,
  get_session_detail: handleGetSessionDetail,
  get_plan: handleGetPlan,
  update_plan: handleUpdatePlan,
  delete_plan: handleDeletePlan,
  start_fleet: handleStartFleet,
  list_skills_rpc: handleListSkillsRpc,
  toggle_skill_rpc: handleToggleSkillRpc,
  reload_skills: handleReloadSkills,
  list_mcp_rpc: handleListMcpRpc,
  toggle_mcp_rpc: handleToggleMcpRpc,
  list_instructions: handleListInstructions,
  list_prompts: handleListPrompts,
  use_prompt: handleUsePrompt,
  clear_chat: async (_msg: any, ctx: MessageContext) => {
    const tabId = ctx.poolKey.split(':').slice(1).join(':');
    chatStateStore.delete(ctx.userLogin, tabId);
  },
};
