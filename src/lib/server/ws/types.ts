import type { WebSocket } from 'ws';
import type { PoolEntry } from './session-pool.js';

export type SessionMiddleware = (req: any, res: any, next: (err?: any) => void) => void;

export interface MessageContext {
  connectionEntry: PoolEntry;
  githubToken: string;
  userLogin: string;
  poolKey: string;
  ws: WebSocket;
}
