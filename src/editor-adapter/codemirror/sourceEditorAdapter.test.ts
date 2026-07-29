import { describe, expect, it, vi } from 'vitest';
import { SourceEditorAdapter } from './sourceEditorAdapter';

describe('SourceEditorAdapter', () => {
  it('flushes the pipeline for the requested sessionId', async () => {
    const adapter = new SourceEditorAdapter();
    const flushA = vi.fn(async () => 7);
    const flushB = vi.fn(async () => 11);

    adapter.attach({
      sessionId: 's1',
      documentId: 'd1',
      pipeline: { flush: flushA, detach: vi.fn() },
    });
    adapter.attach({
      sessionId: 's2',
      documentId: 'd2',
      pipeline: { flush: flushB, detach: vi.fn() },
    });

    await expect(adapter.flush('s2', 'req-2')).resolves.toEqual({
      sessionId: 's2',
      documentId: 'd2',
      requestId: 'req-2',
      revision: 11,
    });
    expect(flushA).not.toHaveBeenCalled();
    expect(flushB).toHaveBeenCalledTimes(1);
  });

  it('detaches only the requested session pipeline', () => {
    const adapter = new SourceEditorAdapter();
    const detachA = vi.fn();
    const detachB = vi.fn();

    adapter.attach({
      sessionId: 's1',
      documentId: 'd1',
      pipeline: { flush: async () => 1, detach: detachA },
    });
    adapter.attach({
      sessionId: 's2',
      documentId: 'd2',
      pipeline: { flush: async () => 2, detach: detachB },
    });

    adapter.detach('s1');

    expect(detachA).toHaveBeenCalledTimes(1);
    expect(detachB).not.toHaveBeenCalled();
    expect(adapter.hasSession('s1')).toBe(false);
    expect(adapter.hasSession('s2')).toBe(true);
  });
});

