//! FormatCommandLayer — semantic edit command dispatcher for Core-backed Source Mode.

import type { EditorView } from 'codemirror';
import {
  type CommandResultDto,
  type EditCommandDto,
  executeEditCommand,
  redoDocument,
  undoDocument,
} from '../lib/coreBridge';
import {
  getCoreSessionState,
  getSourceSyncController,
  markSessionBlocked,
  markSessionRevisionConfirmed,
} from '../lib/coreSession';
import { applySourcePatch, getSourceView } from '../lib/editor.source';
import { showToast } from '../components/toast';
import { logDebug, logException } from '../lib/logger';

export type FormattingAction =
  | { type: 'toggle_strong' }
  | { type: 'toggle_emphasis' }
  | { type: 'toggle_strikethrough' }
  | { type: 'toggle_inline_code' }
  | { type: 'set_heading'; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: 'toggle_block_quote' }
  | { type: 'toggle_list'; kind: 'Unordered' | 'Ordered' }
  | { type: 'insert_code_fence'; language?: string | null }
  | { type: 'insert_link'; href: string; title?: string | null; text?: string | null }
  | { type: 'insert_image'; reference: string; alt?: string | null };

export interface FormatCommandLayerDeps {
  viewProvider: () => EditorView | null;
  getSessionState: typeof getCoreSessionState;
  getSyncController: () => { flush(): Promise<number>; handleResyncSuccess(revision: number): void } | null;
  bridge: {
    executeEditCommand: typeof executeEditCommand;
    undoDocument: typeof undoDocument;
    redoDocument: typeof redoDocument;
  };
  applyPatch: typeof applySourcePatch;
  markRevisionConfirmed: typeof markSessionRevisionConfirmed;
  markBlocked: typeof markSessionBlocked;
  toast: typeof showToast;
}

let formatCmdCounter = 0;

function nextFormatCmdId(prefix: string): string {
  return `${prefix}_${++formatCmdCounter}_${Date.now()}`;
}

const COMMAND_ERROR_MAP: Record<string, string> = {
  REVISION_MISMATCH: '编辑冲突，请重新同步',
  SESSION_NOT_FOUND: '编辑会话已失效，请重新打开文件',
  INVALID_UTF16_BOUNDARY: '选择范围异常，请重试',
  INVALID_RANGE: '编辑范围异常，请重试',
  TRANSACTION_CONFLICT: '编辑命令重复提交冲突，请重试',
  SAVE_FLUSH_TIMEOUT: '仍有编辑未同步完成，请稍后重试',
  INTERNAL: '编辑命令执行失败',
};

function commandErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.code === 'string' && COMMAND_ERROR_MAP[e.code]) {
      return COMMAND_ERROR_MAP[e.code];
    }
  }
  return '格式命令执行失败';
}

function getSelection(view: EditorView): { anchor: number; head: number } {
  const sel = view.state.selection.main;
  return { anchor: sel.anchor, head: sel.head };
}

function buildCommand(action: FormattingAction, view: EditorView): EditCommandDto {
  const selection = getSelection(view);
  switch (action.type) {
    case 'toggle_strong':
    case 'toggle_emphasis':
    case 'toggle_strikethrough':
    case 'toggle_inline_code':
    case 'toggle_block_quote':
      return { type: action.type, ...selection };
    case 'set_heading':
      return { type: 'set_heading', ...selection, level: action.level };
    case 'toggle_list':
      return { type: 'toggle_list', ...selection, kind: action.kind };
    case 'insert_code_fence':
      return {
        type: 'insert_code_fence',
        position: selection.anchor,
        anchor: selection.anchor,
        head: selection.head,
        language: action.language ?? null,
      };
    case 'insert_link':
      return {
        type: 'insert_link',
        ...selection,
        href: action.href,
        title: action.title ?? null,
        text: action.text ?? null,
      };
    case 'insert_image':
      return {
        type: 'insert_image',
        position: selection.anchor,
        reference: action.reference,
        alt: action.alt ?? null,
      };
  }
}

function defaultControllerProvider(): ReturnType<FormatCommandLayerDeps['getSyncController']> {
  try {
    return getSourceSyncController();
  } catch {
    return null;
  }
}

export class FormatCommandLayer {
  constructor(private readonly deps: FormatCommandLayerDeps) {}

  async execute(action: FormattingAction): Promise<CommandResultDto | null> {
    return this.withFlushedSession(`format action ${action.type}`, async (sessionId, baseRevision) => {
      const view = this.deps.viewProvider();
      if (!view) return null;
      const command = buildCommand(action, view);
      return this.deps.bridge.executeEditCommand(
        sessionId,
        command,
        baseRevision,
        nextFormatCmdId('fmt'),
      );
    });
  }

  async executeCommand(command: EditCommandDto): Promise<CommandResultDto | null> {
    return this.executeBuiltCommand(command, 'fmt');
  }

  async undo(maxSteps = 1): Promise<CommandResultDto | null> {
    return this.executeHistoryCommand('undo', maxSteps);
  }

  async redo(maxSteps = 1): Promise<CommandResultDto | null> {
    return this.executeHistoryCommand('redo', maxSteps);
  }

  private async executeBuiltCommand(
    command: EditCommandDto,
    txnPrefix: string,
  ): Promise<CommandResultDto | null> {
    return this.withFlushedSession(`format command ${command.type}`, async (sessionId, baseRevision) => {
      const result = await this.deps.bridge.executeEditCommand(
        sessionId,
        command,
        baseRevision,
        nextFormatCmdId(txnPrefix),
      );
      return result;
    });
  }

  private async executeHistoryCommand(
    kind: 'undo' | 'redo',
    maxSteps: number,
  ): Promise<CommandResultDto | null> {
    return this.withFlushedSession(kind, async (sessionId) => {
      const txnId = nextFormatCmdId(kind);
      return kind === 'undo'
        ? this.deps.bridge.undoDocument(sessionId, txnId, maxSteps)
        : this.deps.bridge.redoDocument(sessionId, txnId, maxSteps);
    });
  }

  private async withFlushedSession(
    label: string,
    run: (sessionId: number, baseRevision: number) => Promise<CommandResultDto | null>,
  ): Promise<CommandResultDto | null> {
    const initial = this.deps.getSessionState();
    if (!initial.isActive) {
      logDebug('formatCommand', 'No active Core session; skipping', { label });
      return null;
    }

    const controller = this.deps.getSyncController();

    try {
      if (controller) {
        await controller.flush();
      }

      const session = this.deps.getSessionState();
      if (!session.isActive || session.sessionId !== initial.sessionId) {
        logDebug('formatCommand', 'Session changed before command dispatch; skipping', {
          label,
          initialSessionId: initial.sessionId,
          currentSessionId: session.sessionId,
        });
        return null;
      }

      const result = await run(session.sessionId, session.confirmedRevision);
      if (!result) return null;
      const latest = this.deps.getSessionState();
      if (!latest.isActive || latest.sessionId !== session.sessionId) {
        logDebug('formatCommand', 'Discarding stale command result', {
          label,
          resultSessionId: result.session_id,
          currentSessionId: latest.sessionId,
        });
        return null;
      }

      this.deps.applyPatch(result.patch.changes, result.selection_after);
      this.deps.markRevisionConfirmed(result.revision);
      controller?.handleResyncSuccess(result.revision);

      logDebug('formatCommand', 'Command applied', {
        label,
        revision: result.revision,
        changeCount: result.patch.changes.length,
      });

      return result;
    } catch (err) {
      logException('formatCommand', 'Command execution failed', err, { label });
      this.deps.toast(commandErrorMessage(err));
      if (err && typeof err === 'object') {
        const e = err as Record<string, unknown>;
        if (e.code === 'SESSION_NOT_FOUND') {
          this.deps.markBlocked();
        }
      }
      return null;
    }
  }
}

export const defaultFormatCommandLayer = new FormatCommandLayer({
  viewProvider: getSourceView,
  getSessionState: getCoreSessionState,
  getSyncController: defaultControllerProvider,
  bridge: { executeEditCommand, undoDocument, redoDocument },
  applyPatch: applySourcePatch,
  markRevisionConfirmed: markSessionRevisionConfirmed,
  markBlocked: markSessionBlocked,
  toast: showToast,
});

export function executeFormattingAction(
  action: FormattingAction,
): Promise<CommandResultDto | null> {
  return defaultFormatCommandLayer.execute(action);
}

export function executeFormatCommand(
  command: EditCommandDto,
): Promise<CommandResultDto | null> {
  return defaultFormatCommandLayer.executeCommand(command);
}

export function executeUndo(maxSteps = 1): Promise<CommandResultDto | null> {
  return defaultFormatCommandLayer.undo(maxSteps);
}

export function executeRedo(maxSteps = 1): Promise<CommandResultDto | null> {
  return defaultFormatCommandLayer.redo(maxSteps);
}
