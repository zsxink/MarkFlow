/**
 * 代码块高亮装饰插件（#448）：替代 tiptap code-block-lowlight 自带的 lowlight 插件。
 *
 * 自带插件的两个问题：
 *  - 重算条件不认 attr-only step（`AttrStep` 无 from/to），切换语言后旧语言装饰原样保留；
 *  - 无语言/未注册语言兜底走 `highlightAuto` 自动检测，纯文本会被误着色。
 *
 * 本插件以 fingerprint（各块 language + textContent）检测变更，任何 step 类型都覆盖；
 * 仅对 lowlight 已注册语言着色，无语言/未注册语言零装饰 = 真纯文本。
 */

import { findChildren } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { RootContent } from 'hast';
import type { createLowlight } from 'lowlight';

/** lowlight v3 未导出实例类型，用工厂返回类型指代。 */
type Lowlight = ReturnType<typeof createLowlight>;

interface CodeSpan {
  text: string;
  classes: string[];
}

interface HighlightState {
  fingerprint: string;
  decorations: DecorationSet;
}

export const codeBlockHighlightPluginKey = new PluginKey<HighlightState>('codeBlockHighlight');

/** 深度展平 lowlight 产出的 hast 树，与 tiptap 的 parseNodes 同构。 */
function collectSpans(nodes: RootContent[], classes: string[], out: CodeSpan[]) {
  for (const node of nodes) {
    const nodeClasses = node.type === 'element'
      ? (node.properties?.className as string[] | undefined) ?? []
      : [];
    const merged = [...classes, ...nodeClasses];
    if (node.type === 'element') collectSpans(node.children, merged, out);
    else if (node.type === 'text') out.push({ text: node.value, classes: merged });
  }
}

function highlightBlock(block: { pos: number; node: PMNode }, lowlight: Lowlight): Decoration[] {
  const language = String(block.node.attrs.language ?? '');
  // 未注册语言（含无语言）不加任何装饰：着色依赖明确声明的语言，不做自动检测。
  if (!language || !lowlight.registered(language)) return [];
  const spans: CodeSpan[] = [];
  collectSpans(lowlight.highlight(language, block.node.textContent).children, [], spans);
  const decorations: Decoration[] = [];
  let from = block.pos + 1;
  for (const span of spans) {
    const to = from + span.text.length;
    if (span.classes.length) {
      decorations.push(Decoration.inline(from, to, { class: span.classes.join(' ') }));
    }
    from = to;
  }
  return decorations;
}

function buildDecorations(doc: PMNode, name: string, lowlight: Lowlight): DecorationSet {
  const decorations = findChildren(doc, node => node.type.name === name)
    .flatMap(block => highlightBlock(block, lowlight));
  return DecorationSet.create(doc, decorations);
}

/** 各代码块的 language + textContent 指纹：语言 attr 变更与文本变更都会改变指纹。 */
function fingerprint(doc: PMNode, name: string): string {
  return findChildren(doc, node => node.type.name === name)
    .map(block => `${String(block.node.attrs.language ?? '')}\u0000${block.node.textContent}`)
    .join('\u0001');
}

export function codeBlockHighlightPlugin(name: string, lowlight: Lowlight): Plugin<HighlightState> {
  return new Plugin<HighlightState>({
    key: codeBlockHighlightPluginKey,
    state: {
      init: (_, { doc }) => ({
        fingerprint: fingerprint(doc, name),
        decorations: buildDecorations(doc, name, lowlight),
      }),
      apply: (transaction, value, _oldState, newState) => {
        if (!transaction.docChanged) return value;
        const nextFingerprint = fingerprint(newState.doc, name);
        if (nextFingerprint === value.fingerprint) {
          // 指纹未变（如代码块外的编辑）：位置经 mapping 平移后沿用，避免整篇重高亮。
          return {
            fingerprint: nextFingerprint,
            decorations: value.decorations.map(transaction.mapping, newState.doc),
          };
        }
        return {
          fingerprint: nextFingerprint,
          decorations: buildDecorations(newState.doc, name, lowlight),
        };
      },
    },
    props: {
      decorations(state) {
        return codeBlockHighlightPluginKey.getState(state)?.decorations;
      },
    },
  });
}
