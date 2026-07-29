import type {
  AdapterFlushResult,
  SourceEditorBinding,
} from '../types';

let adapterRequestId = 0;

function nextAdapterRequestId(): string {
  adapterRequestId += 1;
  return `editor_adapter_${adapterRequestId}`;
}

export class SourceEditorAdapter {
  private readonly bindings = new Map<string, SourceEditorBinding>();

  attach(binding: SourceEditorBinding): void {
    if (!binding.sessionId) {
      throw new Error('SourceEditorAdapter requires a sessionId');
    }
    this.bindings.set(binding.sessionId, binding);
  }

  hasSession(sessionId: string): boolean {
    return this.bindings.has(sessionId);
  }

  getPendingCount(sessionId: string): number {
    const binding = this.getBinding(sessionId);
    return binding.pipeline.getPendingCount?.() ?? 0;
  }

  async flush(sessionId: string, requestId = nextAdapterRequestId()): Promise<AdapterFlushResult> {
    const binding = this.getBinding(sessionId);
    const revision = await binding.pipeline.flush();
    return {
      sessionId,
      documentId: binding.documentId,
      requestId,
      revision,
    };
  }

  detach(sessionId: string): void {
    const binding = this.bindings.get(sessionId);
    if (!binding) return;
    binding.pipeline.detach();
    this.bindings.delete(sessionId);
  }

  dispose(): void {
    for (const sessionId of [...this.bindings.keys()]) {
      this.detach(sessionId);
    }
  }

  private getBinding(sessionId: string): SourceEditorBinding {
    const binding = this.bindings.get(sessionId);
    if (!binding) {
      throw new Error(`SourceEditorAdapter has no binding for session: ${sessionId}`);
    }
    return binding;
  }
}

