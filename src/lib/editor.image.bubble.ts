import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Extension } from '@tiptap/core';
import { assetToOriginalMap, getActiveDocPath } from './editor.state';
import { handleNetworkImage, imagePathToSrc } from './imageUtils';
import { getImageSettings } from './imageUtils';
import { resolveImagePath } from './pathUtils';
import { showImageContextMenu } from '../components/imageContextMenu';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

// ── Image edit bubble plugin ───────────────────────────────────────────

export function imageBubblePlugin(): Extension {
  let bubble: HTMLDivElement | null = null;
  let hasDraftChanges: (() => boolean) | null = null;

  function removeBubble() {
    bubble?.remove();
    bubble = null;
    hasDraftChanges = null;
  }

  function getOriginalSrc(src: string) {
    return assetToOriginalMap.get(src) || src;
  }

  function getImageInfoFromTarget(view: any, target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return null;
    let img = target.closest('img') as HTMLImageElement | null;
    if (!img) {
      const wrapper = target.closest('.image-node-view');
      if (wrapper) img = wrapper.querySelector('img');
    }
    if (!img) return null;
    const basePos = view.posAtDOM(img, 0);
    const candidates = [basePos, basePos - 1, basePos + 1].filter(
      (value, index, array) => value >= 0 && array.indexOf(value) === index
    );
    for (const pos of candidates) {
      const node = view.state.doc.nodeAt(pos);
      if (node?.type.name === 'image') {
        return { img, node, pos };
      }
    }
    return null;
  }

  async function applyImageChanges(view: any, pos: number, node: any, caption: string, pathValue: string) {
    const trimmedPath = pathValue.trim();
    if (!trimmedPath) return;

    const oldSrc = node.attrs.src as string;

    let nextSrc = trimmedPath;
    let nextOriginalSrc: string | null = null;
    if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
      const settings = await getImageSettings();
      const docPath = getActiveDocPath();
      const savedPath = await handleNetworkImage(trimmedPath, docPath, settings);
      if (savedPath.startsWith('http://') || savedPath.startsWith('https://') || savedPath.startsWith('data:')) {
        nextSrc = savedPath;
      } else {
        const absolutePath = docPath ? resolveImagePath(savedPath, docPath) : savedPath;
        nextSrc = imagePathToSrc(absolutePath, null);
        nextOriginalSrc = savedPath;
      }
    } else if (!trimmedPath.startsWith('data:')) {
      const docPath = getActiveDocPath();
      const absolutePath = docPath ? resolveImagePath(trimmedPath, docPath) : trimmedPath;
      nextSrc = imagePathToSrc(absolutePath, null);
      nextOriginalSrc = trimmedPath;
    }

    if (oldSrc !== nextSrc) {
      assetToOriginalMap.delete(oldSrc);
    }
    if (nextOriginalSrc && nextOriginalSrc !== nextSrc) {
      assetToOriginalMap.set(nextSrc, nextOriginalSrc);
    } else {
      assetToOriginalMap.delete(nextSrc);
    }

    const tr = view.state.tr;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      src: nextSrc,
      alt: caption.trim() || null,
    });
    view.dispatch(tr);
    removeBubble();
    view.focus();
  }

  function showBubble(view: any, pos: number, node: any) {
    removeBubble();

    const dom = view.nodeDOM(pos) as HTMLElement | null;
    if (!dom) return;
    const img = dom.querySelector('img') || (dom.tagName === 'IMG' ? dom : null);
    if (!img) return;

    const rect = img.offsetHeight > 0 ? img.getBoundingClientRect() : dom.getBoundingClientRect();
    bubble = document.createElement('div');
    bubble.className = 'image-bubble image-edit-panel';
    bubble.style.position = 'fixed';
    bubble.style.left = `${rect.left + rect.width / 2}px`;
    bubble.style.top = `${rect.top - 12}px`;
    bubble.style.transform = 'translate(-50%, -100%)';
    bubble.style.zIndex = '150';

    const currentSrc = node.attrs.src as string;
    const originalSrc = getOriginalSrc(currentSrc);
    const originalAlt = String(node.attrs.alt || '');

    const row1 = document.createElement('div');
    row1.className = 'image-edit-row image-edit-fields';

    const captionLabel = document.createElement('label');
    captionLabel.className = 'image-edit-label';
    captionLabel.textContent = '图片注释';

    const captionInput = document.createElement('input');
    captionInput.className = 'image-edit-input';
    captionInput.value = originalAlt;
    captionInput.placeholder = '输入图片注释';

    const pathLabel = document.createElement('label');
    pathLabel.className = 'image-edit-label';
    pathLabel.textContent = '路径';

    const pathInput = document.createElement('input');
    pathInput.className = 'image-edit-input image-edit-path-input';
    pathInput.value = originalSrc;
    pathInput.placeholder = '输入图片路径或 URL';

    captionLabel.appendChild(captionInput);
    pathLabel.appendChild(pathInput);
    row1.append(captionLabel, pathLabel);

    const row2 = document.createElement('div');
    row2.className = 'image-edit-row image-edit-actions';

    const chooseButton = document.createElement('button');
    chooseButton.type = 'button';
    chooseButton.className = 'image-edit-action';
    chooseButton.textContent = '选择';
    chooseButton.addEventListener('click', async () => {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }],
      });
      if (typeof selected === 'string') {
        pathInput.value = selected;
      }
    });

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'image-edit-action image-edit-confirm';
    confirmButton.textContent = '确认';
    confirmButton.addEventListener('click', async () => {
      await applyImageChanges(view, pos, node, captionInput.value, pathInput.value);
    });

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'image-edit-action';
    cancelButton.textContent = '取消';
    cancelButton.addEventListener('click', () => {
      removeBubble();
      view.focus();
    });

    row2.append(chooseButton, confirmButton, cancelButton);
    bubble.append(row1, row2);
    document.body.appendChild(bubble);

    hasDraftChanges = () => {
      return captionInput.value !== originalAlt || pathInput.value.trim() !== originalSrc;
    };

    requestAnimationFrame(() => captionInput.focus());
  }

  return Extension.create({
    name: 'imageBubble',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('image-bubble'),
          view() {
            const handleMouseDown = (event: MouseEvent) => {
              const target = event.target;
              if (bubble && target instanceof Node && !bubble.contains(target) && !hasDraftChanges?.()) {
                removeBubble();
              }
            };
            const handleKeyDown = (event: KeyboardEvent) => {
              if (event.key === 'Escape' && bubble) {
                removeBubble();
              }
            };
            document.addEventListener('mousedown', handleMouseDown);
            document.addEventListener('keydown', handleKeyDown);
            return {
              destroy() {
                document.removeEventListener('mousedown', handleMouseDown);
                document.removeEventListener('keydown', handleKeyDown);
                removeBubble();
              },
            };
          },
          props: {
            handleDOMEvents: {
              click(view, event) {
                if (event.button !== 0) return false;
                const imageInfo = getImageInfoFromTarget(view, event.target);
                if (!imageInfo) return false;
                event.preventDefault();
                event.stopPropagation();
                showBubble(view, imageInfo.pos, imageInfo.node);
                return true;
              },
              contextmenu(view, event) {
                const imageInfo = getImageInfoFromTarget(view, event.target);
                if (!imageInfo) return false;
                if (imageInfo.img.style.display === 'none') return false;
                event.preventDefault();
                event.stopPropagation();
                const currentSrc = imageInfo.node.attrs.src as string;
                showImageContextMenu(event.clientX, event.clientY, {
                  src: currentSrc,
                  originalSrc: getOriginalSrc(currentSrc),
                  docPath: getActiveDocPath(),
                });
                return true;
              },
            },
          },
        }),
      ];
    },
  });
}
