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
