import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { Extension } from '@tiptap/core';
import { assetToOriginalMap, getActiveDocPath } from './editor.state';
import { resolveImagePath } from './pathUtils';
import { imagePathToSrc } from './imageUtils';

/**
 * Resolve relative-image src attributes to absolute paths in the ProseMirror
 * document, so images render correctly regardless of the document's location.
 * Stores the original relative path in assetToOriginalMap so the serializer
 * can reverse it back when converting to Markdown.
 */
export function imageSrcResolverPlugin(): Extension {
  return Extension.create({
    name: 'imageSrcResolver',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('image-src-resolver'),
          appendTransaction(transactions, _oldState, newState) {
            const tr = transactions.find(t => t.docChanged);
            if (!tr) return;
            const docPath = getActiveDocPath();
            if (!docPath) return;
            let imageTr: Transaction | null = null;
            newState.doc.descendants((node, pos) => {
              if (node.type.name !== 'image') return;
              const src = node.attrs.src as string;
              if (!src || src.startsWith('http') || src.startsWith('data:') || src.startsWith('asset:')) return;
              const absolutePath = resolveImagePath(src, docPath);
              const newSrc = imagePathToSrc(absolutePath, null);
              if (newSrc !== src) {
                assetToOriginalMap.set(newSrc, src);
                if (!imageTr) imageTr = newState.tr;
                imageTr.setNodeMarkup(pos, undefined, { ...node.attrs, src: newSrc });
              }
            });
            return imageTr;
          },
        }),
      ];
    },
  });
}
