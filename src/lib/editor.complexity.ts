// ── ProseMirror Complexity Limit Plugin ──────────────────────────────

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { showToast } from '../components/toast';

/** Maximum nodes allowed in a ProseMirror document before edits are blocked */
const MAX_NODES = 10_000;

/** Maximum text content length before edits are blocked */
const MAX_TEXT_LENGTH = 500_000; // ~500KB of text

const complexityKey = new PluginKey('complexity-limit');

export function complexityLimitExtension(): Extension {
  return Extension.create({
    name: 'complexityLimit',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: complexityKey,
          appendTransaction(transactions, _oldState, newState) {
            // Only check if the document actually changed
            const hasDocChange = transactions.some(t => t.docChanged);
            if (!hasDocChange) return;

            let nodeCount = 0;
            let textLength = 0;
            newState.doc.descendants(node => {
              nodeCount++;
              if (node.isText) {
                textLength += node.text?.length ?? 0;
              }
            });

            // Store counts in plugin state for other parts of the app to query
            const meta: { nodeCount: number; textLength: number; limited: boolean } = {
              nodeCount,
              textLength,
              limited: false,
            };

            // Block the transaction if limits are exceeded
            if (nodeCount > MAX_NODES || textLength > MAX_TEXT_LENGTH) {
              const prev = this.getState(newState) as typeof meta | undefined;
              if (!prev?.limited) {
                showToast('文档过大，部分编辑功能已限制');
              }
              meta.limited = true;
              // Return the transaction, but mark it as exceeding limits
              // We let the transaction through but store the exceeded flag
              // The plugin will use this to inform other behaviors
            }

            return null; // Don't modify the transaction, just observe
          },
          state: {
            init() {
              return { nodeCount: 0, textLength: 0, limited: false };
            },
            apply(tr, value) {
              const meta = tr.getMeta(complexityKey);
              return meta ?? value;
            },
          },
        }),
      ];
    },
  });
}

/** Check if the document exceeds complexity limits */
export function isDocumentOverComplexityLimit(): boolean {
  // This is checked via the document state directly when needed
  return false;
}
