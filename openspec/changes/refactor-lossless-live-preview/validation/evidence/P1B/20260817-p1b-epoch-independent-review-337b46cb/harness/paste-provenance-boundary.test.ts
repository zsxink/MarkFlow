import { ChangeSet } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string) => {
    if (command === 'reload_lossless_document') {
      throw { code: 'io', message: 'injected reload read failure' };
    }
    throw new Error(`unexpected command: ${command}`);
  }),
}));

import { EditorSurfaceBinding } from '../../../../../../../../src/lib/lossless/editorSurfaceBinding';

describe('P1B independent paste provenance boundary probe', () => {
  it('retains CRLF provenance when typing immediately before a pending paste', () => {
    const binding = Object.create(EditorSurfaceBinding.prototype) as {
      pasteProvenance: Array<{
        from: number;
        to: number;
        logicalText: string;
        endings: Array<'lf' | 'crlf' | 'cr'>;
      }>;
      mapPasteProvenance(changes: ChangeSet): void;
      annotatePasteProvenance(changes: Array<{
        from: number;
        to: number;
        fromAfter: number;
        insert: string;
      }>): Array<{ insertedLineEndings?: string[] }>;
    };

    // The first optimistic transaction pasted `a\r\n`, normalized by CM to
    // `a\n`, and attached exact CRLF provenance to [0, 2].
    binding.pasteProvenance = [{
      from: 0,
      to: 2,
      logicalText: 'a\n',
      endings: ['crlf'],
    }];

    // Before the batch flushes, the user types `x` at the paste's start. The
    // paste span should move to [1, 3], not expand to include the new `x`.
    binding.mapPasteProvenance(ChangeSet.of({ from: 0, to: 0, insert: 'x' }, 2));
    expect(binding.pasteProvenance[0]).toMatchObject({ from: 1, to: 3 });

    // The composed confirmed->optimistic patch inserts `xa\n`; its newline
    // must still carry the original explicit CRLF family.
    expect(binding.annotatePasteProvenance([
      { from: 0, to: 0, fromAfter: 0, insert: 'xa\n' },
    ])[0]?.insertedLineEndings).toEqual(['crlf']);
  });

  it('does not permanently dispose the active sync controller when reload fails', async () => {
    const controller = { dispose: vi.fn() };
    const binding = {
      disposed: false,
      controller,
      pendingChangeSets: [{}],
      pendingRawPasteProvenance: [{}],
      pasteProvenance: [{}],
      sessionId: 7,
    };

    await expect(
      EditorSurfaceBinding.prototype.reload.call(binding as never, '/missing.md', 'lf'),
    ).rejects.toMatchObject({ code: 'io' });
    expect(controller.dispose).not.toHaveBeenCalled();
  });
});
