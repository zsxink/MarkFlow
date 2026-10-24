// ── ProseMirror Complexity Limit Plugin ──────────────────────────────

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { uiPorts } from '../infra/ui-ports';
import { getCachedSettings } from '../infra/storage';
import { DEFAULT_SETTINGS } from '../types/settings';

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

            // The extension is created once at init, so the bounds are read
            // per transaction (same pattern as code-block.ts) — a settings
            // change then applies to the very next edit without rebuilding.
            const settings = getCachedSettings();
            const maxNodes = settings.wysiwygMaxNodes ?? DEFAULT_SETTINGS.wysiwygMaxNodes;
            const maxTextLength = settings.wysiwygMaxTextLength ?? DEFAULT_SETTINGS.wysiwygMaxTextLength;

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
            if (nodeCount > maxNodes || textLength > maxTextLength) {
              const prev = this.getState(newState) as typeof meta | undefined;
              if (!prev?.limited) {
                // Name the bound that actually tripped so the numbers always
                // match the effective configuration, never stale constants.
                uiPorts.notify(nodeCount > maxNodes
                  ? `文档过大（节点数 ${nodeCount}，超过上限 ${maxNodes}），部分编辑功能已限制`
                  : `文档过大（文本长度 ${textLength} 字符，超过上限 ${maxTextLength}），部分编辑功能已限制`);
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
