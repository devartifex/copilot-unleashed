import { resolve, sep } from 'node:path';
import { logSecurity } from '../security-log.js';
import { UPLOAD_DIR_PREFIX } from './constants.js';

/** SDK attachment union – mirrors the types accepted by session.send(). */
export type SdkAttachment =
  | { type: 'file'; path: string; displayName?: string }
  | { type: 'directory'; path: string; displayName?: string }
  | { type: 'selection'; filePath: string; displayName: string; selection?: { start: { line: number; character: number }; end: { line: number; character: number } }; text?: string }
  | { type: 'blob'; data: string; mimeType: string };

/** Validate that an attachment path is an absolute path inside the upload directory (prevents arbitrary file reads). */
export function isValidAttachmentPath(filePath: string): boolean {
  const resolved = resolve(filePath);
  return resolved.startsWith(UPLOAD_DIR_PREFIX + sep);
}

/** Map client-sent attachments to the SDK format, validating paths and filtering invalid entries. */
export function mapAttachmentsToSdk(raw: unknown): SdkAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const mapped: SdkAttachment[] = [];

  for (const item of raw) {
    const a = item as Record<string, unknown>;
    const attachType = typeof a.type === 'string' ? a.type : 'file';

    if (attachType === 'selection') {
      const filePath = a.filePath as string | undefined;
      const displayName = (a.displayName ?? a.name) as string | undefined;
      if (typeof filePath !== 'string' || typeof displayName !== 'string') continue;
      if (!isValidAttachmentPath(filePath)) {
        logSecurity('warn', 'ATTACHMENT_PATH_REJECTED', { path: filePath });
        continue;
      }
      const entry: SdkAttachment = { type: 'selection', filePath, displayName };
      if (a.selection && typeof a.selection === 'object') {
        entry.selection = a.selection as SdkAttachment extends { type: 'selection'; selection?: infer S } ? S : never;
      }
      if (typeof a.text === 'string') entry.text = a.text;
      mapped.push(entry);
    } else if (attachType === 'blob') {
      const data = a.data as string | undefined;
      const mimeType = a.mimeType as string | undefined;
      if (typeof data !== 'string' || typeof mimeType !== 'string') continue;
      // Enforce 10MB base64 limit (~7.5MB decoded)
      const MAX_BLOB_SIZE = 10 * 1024 * 1024;
      if (data.length > MAX_BLOB_SIZE) {
        logSecurity('warn', 'BLOB_SIZE_EXCEEDED', { size: data.length, limit: MAX_BLOB_SIZE });
        continue;
      }
      // Validate mimeType format
      if (!/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/.test(mimeType)) {
        logSecurity('warn', 'BLOB_INVALID_MIMETYPE', { mimeType });
        continue;
      }
      mapped.push({ type: 'blob', data, mimeType });
    } else if (attachType === 'file' || attachType === 'directory') {
      const path = a.path as string | undefined;
      const name = (a.displayName ?? a.name) as string | undefined;
      if (typeof path !== 'string') continue;
      if (!isValidAttachmentPath(path)) {
        logSecurity('warn', 'ATTACHMENT_PATH_REJECTED', { path });
        continue;
      }
      mapped.push({
        type: attachType as 'file' | 'directory',
        path,
        ...(typeof name === 'string' ? { displayName: name } : {}),
      });
    }
  }

  return mapped.length ? mapped : undefined;
}
