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
