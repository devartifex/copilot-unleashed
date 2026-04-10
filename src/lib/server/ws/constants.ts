import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const MAX_MESSAGE_LENGTH = 10_000;

export const VALID_MESSAGE_TYPES = new Set([
  'new_session', 'message', 'list_models', 'set_mode',
  'abort', 'set_model', 'set_reasoning', 'user_input_response',
  'permission_response', 'elicitation_response', 'ping',
  'list_tools', 'list_agents', 'select_agent', 'deselect_agent',
  'get_quota', 'compact', 'list_sessions', 'resume_session',
  'delete_session', 'get_session_detail', 'get_plan', 'update_plan', 'delete_plan', 'start_fleet',
  'list_skills_rpc', 'toggle_skill_rpc', 'reload_skills',
  'list_mcp_rpc', 'toggle_mcp_rpc',
  'list_instructions', 'list_prompts', 'use_prompt',
  'list_extensions', 'toggle_extension', 'reload_extensions',
  'shell_exec', 'shell_kill',
  'workspace_list_files', 'workspace_read_file', 'workspace_create_file',
  'clear_chat',
  'get_session_history', 'session_log',
]);

export const VALID_MODES = new Set(['interactive', 'plan', 'autopilot']);
export const VALID_REASONING = new Set(['low', 'medium', 'high', 'xhigh']);
export const HEARTBEAT_INTERVAL = 30_000;
// How many consecutive pings can go unanswered before the server terminates
// the WebSocket. Mobile PWAs (especially iOS Safari) are suspended when
// backgrounded and cannot respond to pings. A tolerance of 3 gives ~90 s
// of grace — enough to survive brief device switches without killing the
// connection, while still detecting truly dead sockets promptly.
export const MAX_MISSED_PINGS = 3;
export const UPLOAD_DIR_PREFIX = join(tmpdir(), 'copilot-uploads');

export const RATE_LIMITED_TYPES = new Set(['message', 'new_session', 'resume_session', 'compact', 'start_fleet']);
export const WS_RATE_LIMIT_MAX = 30;
export const WS_RATE_LIMIT_WINDOW_MS = 60_000;
