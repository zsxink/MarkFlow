/**
 * 统一内容型弹窗 API — showModal
 *
 * 用于设置、新建文件等需要复杂自定义内容的弹窗。
 * 自动处理：backdrop 关闭、Escape 关闭、scroll lock。
 * 返回 { element, hide() }，调用方自行绑定事件。
 */

export interface ModalOptions {
  /** innerHTML 字符串或 HTMLElement */
  content: string | HTMLElement;
  /** 额外 CSS class 追加到 .modal 容器 */
  className?: string;
  /** 弹窗关闭时的回调 */
  onClose?: () => void;
}

export interface ModalHandle {
  /** 创建的 .modal 元素 */
  element: HTMLElement;
  /** 编程关闭弹窗 */
  hide: () => void;
}

export function showModal(options: ModalOptions): ModalHandle {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const modal = document.createElement('div');
  modal.className = 'modal';
  if (options.className) {
    modal.classList.add(options.className);
  }

  if (typeof options.content === 'string') {
    modal.innerHTML = options.content;
  } else {
    modal.appendChild(options.content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Lock body scroll
  document.body.style.overflow = 'hidden';

  const hide = () => {
    overlay.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', keyHandler);
    if (options.onClose) options.onClose();
  };

  // Backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide();
  });

  // Escape
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') hide();
  };
  document.addEventListener('keydown', keyHandler);

  return { element: modal, hide };
}
