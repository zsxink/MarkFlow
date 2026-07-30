import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  logDebug: vi.fn(),
  logException: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}));

vi.mock('./logger', () => ({
  logDebug: mocks.logDebug,
  logException: mocks.logException,
}));

import {
  openDocument,
  applyTextPatch,
  saveDocument,
  closeDocument,
  resyncDocument,
  flushDocument,
  getDocumentText,
  getRenderBlocks,
  getExportDocument,
  getOutline,
  getDocumentStats,
  reloadDocument,
  executeEditCommand,
  undoDocument,
  redoDocument,
  BridgeError,
  generateRequestId,
} from './coreBridge';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('coreBridge', () => {
  describe('openDocument', () => {
    it('calls invoke with correct command name and path argument', async () => {
      const mockDto = {
        protocol_version: 1,
        session_id: 42,
        document_id: 1,
        revision: 5,
        persisted_revision: 3,
        text: '# Hello',
        size_class: 'normal',
        file_identity: { canonical_path: '/tmp/test.md', size: 100, fingerprint_hash: 'abc' },
        outline: [],
        stats: { line_count: 1, byte_count: 8 },
        capabilities: { writable: true, patch_editing: true, core_save: true },
      };
      mocks.invoke.mockResolvedValue(mockDto);

      const result = await openDocument('/tmp/test.md');
      expect(result).toEqual(mockDto);
      expect(mocks.invoke).toHaveBeenCalledWith('open_document', { path: '/tmp/test.md' });
    });

    it('wraps invoke error in BridgeError', async () => {
      mocks.invoke.mockRejectedValue({ code: 'FILE_NOT_FOUND', message: 'not found' });
      await expect(openDocument('/tmp/missing.md')).rejects.toThrow(BridgeError);
    });
  });

  describe('applyTextPatch', () => {
    it('constructs a ProtocolEnvelope wrapper with required fields', async () => {
      const ack = { transaction_id: 'txn-1', revision: 6 };
      mocks.invoke.mockResolvedValue(ack);

      const patch = {
        transaction_id: 'txn-1',
        base_revision: 5,
        changes: [{ from: 0, to: 5, insert: 'Hello' }],
      };

      const result = await applyTextPatch(42, patch);
      expect(result).toEqual(ack);
      expect(mocks.invoke).toHaveBeenCalledTimes(1);
      const [command, payload] = mocks.invoke.mock.calls[0];
      expect(command).toBe('apply_text_patch');
      expect(payload.envelope).toBeDefined();
      expect(payload.envelope.protocol_version).toBe(1);
      expect(payload.envelope.request_id).toBeDefined();
      expect(typeof payload.envelope.request_id).toBe('string');
      expect(payload.envelope.session_id).toBe(42);
      expect(payload.envelope.payload).toEqual(patch);
    });

    it('includes window_label when provided in options', async () => {
      mocks.invoke.mockResolvedValue({ transaction_id: 'txn-2', revision: 7 });

      const patch = {
        transaction_id: 'txn-2',
        base_revision: 6,
        changes: [],
      };

      await applyTextPatch(42, patch, { windowLabel: 'main' });
      const [, payload] = mocks.invoke.mock.calls[0];
      expect(payload.envelope.window_label).toBe('main');
    });
  });

  describe('saveDocument', () => {
    it('calls invoke with correct arguments', async () => {
      const saveResult = { revision: 10, file_identity: { canonical_path: '/tmp/test.md', size: 120, fingerprint_hash: 'def' } };
      mocks.invoke.mockResolvedValue(saveResult);

      const result = await saveDocument(42);
      expect(result).toEqual(saveResult);
      expect(mocks.invoke).toHaveBeenCalledWith('save_document_command', { session_id: 42 });
    });
  });

  describe('closeDocument', () => {
    it('calls invoke and returns void', async () => {
      mocks.invoke.mockResolvedValue(undefined);

      const result = await closeDocument(42);
      expect(result).toBeUndefined();
      expect(mocks.invoke).toHaveBeenCalledWith('close_document', { session_id: 42 });
    });
  });

  describe('resyncDocument', () => {
    it('calls invoke with correct args', async () => {
      const resyncResult = { revision: 8, text: '# Updated' };
      mocks.invoke.mockResolvedValue(resyncResult);

      const result = await resyncDocument(42, 5);
      expect(result).toEqual(resyncResult);
      expect(mocks.invoke).toHaveBeenCalledWith('resync_document', {
        session_id: 42,
        confirmed_revision: 5,
      });
    });
  });

  describe('flushDocument', () => {
    it('calls invoke with correct args', async () => {
      mocks.invoke.mockResolvedValue({ revision: 6 });

      const result = await flushDocument(42);
      expect(result).toEqual({ revision: 6 });
      expect(mocks.invoke).toHaveBeenCalledWith('flush_document', { session_id: 42 });
    });
  });

  describe('getDocumentText', () => {
    it('calls invoke and returns text and revision', async () => {
      mocks.invoke.mockResolvedValue({ text: '# Hello', revision: 5 });

      const result = await getDocumentText(42);
      expect(result).toEqual({ text: '# Hello', revision: 5 });
      expect(mocks.invoke).toHaveBeenCalledWith('get_document_text', { session_id: 42 });
    });
  });

  describe('getRenderBlocks', () => {
    it('calls invoke with session, revision, viewport, and request id', async () => {
      const renderResult = {
        session_id: 42,
        document_id: 9,
        revision: 5,
        request_id: 'render-1',
        viewport: { start: 0, end: 20 },
        large_document: false,
        blocks: [
          {
            id: 'b1',
            kind: 'heading',
            level: 1,
            source_range: { start: 0, end: 7 },
            content_range: { start: 2, end: 7 },
            line_range: { start: 0, end: 1 },
            text: '# Title',
            inlines: [],
          },
        ],
      };
      mocks.invoke.mockResolvedValue(renderResult);

      const result = await getRenderBlocks(42, 5, { start: 0, end: 20 }, 'render-1');

      expect(result).toEqual(renderResult);
      expect(mocks.invoke).toHaveBeenCalledWith('get_render_blocks', {
        session_id: 42,
        revision: 5,
        viewport: { start: 0, end: 20 },
        request_id: 'render-1',
      });
    });
  });

  describe('getExportDocument', () => {
    it('calls invoke with session, revision, request id, and schema options', async () => {
      const exportResult = {
        schema_version: 1,
        session_id: 42,
        document_id: 9,
        base_revision: 5,
        export_request_id: 'export-1',
        metadata: { frontmatter: null },
        blocks: [],
        assets: [],
        diagnostics: [],
      };
      mocks.invoke.mockResolvedValue(exportResult);

      const result = await getExportDocument(42, 5, 'export-1');

      expect(result).toEqual(exportResult);
      expect(mocks.invoke).toHaveBeenCalledWith('get_export_document', {
        session_id: 42,
        revision: 5,
        export_request_id: 'export-1',
        options: { max_schema_version: 1 },
      });
    });

    it('wraps export-specific stale revision errors', async () => {
      mocks.invoke.mockRejectedValue({
        code: 'EXPORT_STALE_REVISION',
        message: 'EXPORT_STALE_REVISION: Stale revision',
      });

      await expect(getExportDocument(42, 1, 'export-stale')).rejects.toMatchObject({
        code: 'EXPORT_STALE_REVISION',
      });
    });
  });

  describe('getOutline', () => {
    it('calls invoke and returns outline items', async () => {
      const outline = { items: [{ level: 1, text: 'Title', line: 0 }] };
      mocks.invoke.mockResolvedValue(outline);

      const result = await getOutline(42);
      expect(result).toEqual(outline);
      expect(mocks.invoke).toHaveBeenCalledWith('get_outline', { session_id: 42 });
    });
  });

  describe('getDocumentStats', () => {
    it('calls invoke and returns stats', async () => {
      const stats = { line_count: 10, byte_count: 100 };
      mocks.invoke.mockResolvedValue(stats);

      const result = await getDocumentStats(42);
      expect(result).toEqual(stats);
      expect(mocks.invoke).toHaveBeenCalledWith('get_document_stats', { session_id: 42 });
    });
  });

  describe('reloadDocument', () => {
    it('calls invoke with correct args', async () => {
      const reloadResult = { revision: 5, text: '# Reloaded', file_identity: { canonical_path: '/tmp/test.md', size: 50, fingerprint_hash: 'xyz' } };
      mocks.invoke.mockResolvedValue(reloadResult);

      const result = await reloadDocument(42);
      expect(result).toEqual(reloadResult);
      expect(mocks.invoke).toHaveBeenCalledWith('reload_document', { session_id: 42 });
    });
  });

  describe('edit commands', () => {
    it('passes execute_edit_command args and returns patch-first result', async () => {
      const resultDto = {
        session_id: 42,
        transaction_id: 'fmt-1',
        revision: 6,
        patch: {
          transaction_id: 'fmt-1',
          base_revision: 5,
          changes: [{ from: 0, to: 4, insert: '**bold**' }],
          selection_after: null,
        },
        affected_ranges: [{ start: 0, end: 4 }],
        selection_after: { anchor: 8, head: 8 },
      };
      mocks.invoke.mockResolvedValue(resultDto);

      const command = { type: 'toggle_strong' as const, anchor: 0, head: 4 };
      const result = await executeEditCommand(42, command, 5, 'fmt-1');

      expect(result).toEqual(resultDto);
      expect(mocks.invoke).toHaveBeenCalledWith('execute_edit_command', {
        session_id: 42,
        command,
        base_revision: 5,
        frontend_txn_id: 'fmt-1',
      });
    });

    it('passes undo and redo document args', async () => {
      const resultDto = {
        session_id: 42,
        transaction_id: 'undo-1',
        revision: 7,
        patch: {
          transaction_id: 'undo-1',
          base_revision: 6,
          changes: [],
          selection_after: null,
        },
        affected_ranges: [],
        selection_after: null,
      };
      mocks.invoke.mockResolvedValue(resultDto);

      await undoDocument(42, 'undo-1', 1);
      expect(mocks.invoke).toHaveBeenCalledWith('undo_document', {
        session_id: 42,
        frontend_txn_id: 'undo-1',
        max_steps: 1,
      });

      await redoDocument(42, 'redo-1', 2);
      expect(mocks.invoke).toHaveBeenCalledWith('redo_document', {
        session_id: 42,
        frontend_txn_id: 'redo-1',
        max_steps: 2,
      });
    });
  });

  describe('BridgeError.fromInvokeError', () => {
    it('extracts code and message from error-like objects', () => {
      const err = { code: 'FILE_NOT_FOUND', message: 'file not found' };
      const bridgeErr = BridgeError.fromInvokeError(err);
      expect(bridgeErr).toBeInstanceOf(BridgeError);
      expect(bridgeErr.code).toBe('FILE_NOT_FOUND');
      expect(bridgeErr.message).toBe('file not found');
      expect(bridgeErr.name).toBe('BridgeError');
    });

    it('falls back to UNKNOWN code when code is missing', () => {
      const err = { message: 'something went wrong' };
      const bridgeErr = BridgeError.fromInvokeError(err);
      expect(bridgeErr.code).toBe('UNKNOWN');
      expect(bridgeErr.message).toBe('something went wrong');
    });

    it('falls back to UNKNOWN for non-object values', () => {
      const bridgeErr = BridgeError.fromInvokeError('string error');
      expect(bridgeErr.code).toBe('UNKNOWN');
      expect(bridgeErr.message).toBe('string error');
    });

    it('handles null and undefined', () => {
      const nullErr = BridgeError.fromInvokeError(null);
      expect(nullErr.code).toBe('UNKNOWN');
      expect(nullErr.message).toBe('null');

      const undefErr = BridgeError.fromInvokeError(undefined);
      expect(undefErr.code).toBe('UNKNOWN');
      expect(undefErr.message).toBe('undefined');
    });

    it('uses String(err) when message is not a string', () => {
      const err = { code: 'ERR', message: 123 };
      const bridgeErr = BridgeError.fromInvokeError(err);
      expect(bridgeErr.code).toBe('ERR');
      expect(bridgeErr.message).toBe('[object Object]');
    });
  });

  describe('generateRequestId', () => {
    it('returns a string', () => {
      const id = generateRequestId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });
});
