export interface AdapterRequestContext {
  sessionId: string;
  documentId: string;
  requestId: string;
}

export interface SourcePatchPipeline {
  flush(): Promise<number>;
  detach(): void;
  getPendingCount?(): number;
}

export interface SourceEditorBinding {
  sessionId: string;
  documentId: string;
  pipeline: SourcePatchPipeline;
}

export interface AdapterFlushResult extends AdapterRequestContext {
  revision: number;
}

