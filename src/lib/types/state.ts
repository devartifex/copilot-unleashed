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

export interface ElicitationState {
  elicitationId?: string;
  message?: string;
  requestedSchema?: {
    type?: string;
    properties?: Record<string, {
      type?: string;
      description?: string;
      enum?: string[];
      default?: unknown;
      minimum?: number;
      maximum?: number;
      minLength?: number;
      maxLength?: number;
    }>;
    required?: string[];
  };
  mode?: string;
  elicitationSource?: string;
}

export interface PlanState {
  exists: boolean;
  content: string;
  path?: string;
}
