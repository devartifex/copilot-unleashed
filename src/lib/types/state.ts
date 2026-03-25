export interface UserInputState {
  pending: boolean;
  question: string;
  choices?: string[];
  allowFreeform: boolean;
}

export interface PermissionRequestState {
  requestId: string;
  kind: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}

export interface ContextInfo {
  tokenLimit: number;
  currentTokens: number;
  messagesLength: number;
}

export interface PlanState {
  exists: boolean;
  content: string;
  path?: string;
}
