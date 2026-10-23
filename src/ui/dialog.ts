/**
 * 统一对话框 API — showDialog
 *
 * 创建模态对话框，返回 Promise<string | null>。
 * 自动处理：backdrop 点击关闭、Escape 关闭、X 按钮关闭、focus trap。
 */

export interface DialogButton {
  label: string;
  value: string;
  primary?: boolean;
  danger?: boolean;
}

export interface DialogOptions {
  title: string;
  body: string | HTMLElement;
  buttons: DialogButton[];
  width?: string;
  /** 正文与底部按钮区域的内边距，默认 '16px 24px' */
  padding?: string;
  onClose?: () => void;
}

export function showDialog(options: DialogOptions): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let settled = false;

    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      document.removeEventListener('keydown', keyHandler);
      document.body.style.overflow = '';
      if (options.onClose) options.onClose();
      resolve(result);
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    if (options.title) {
      overlay.setAttribute('aria-labelledby', 'dialog-title');
    }

    // Title bar
    const headerHtml = options.title
      ? `<div class="modal-header">
          <span id="dialog-title">${escapeHtml(options.title)}</span>
          <button class="modal-close" data-dialog-close aria-label="关闭">✕</button>
        </div>`
      : '';

    // Body
    const pad = options.padding ?? '16px 24px';
    let bodyHtml: string;
    if (typeof options.body === 'string') {
      bodyHtml = `<div style="padding:${pad};">${options.body}</div>`;
    } else {
      bodyHtml = '';
    }

    // Buttons
    const btnHtml = options.buttons.length
      ? `<div class="modal-footer" style="padding:${pad};display:flex;justify-content:flex-end;gap:8px;">
          ${options.buttons.map((b, i) => {
            const cls = b.primary ? 'btn-primary' : b.danger ? 'btn-danger' : 'btn-secondary';
            return `<button type="button" class="${cls}" data-dialog-value="${escapeHtml(b.value)}" data-dialog-index="${i}">${escapeHtml(b.label)}</button>`;
          }).join('')}
        </div>`
      : '';

    const widthStyle = options.width ? `style="width:${options.width}"` : '';

    overlay.innerHTML = `
      <div class="modal" ${widthStyle}>
        ${headerHtml}
        ${bodyHtml}
        ${btnHtml}
      </div>
    `;

    // If body is HTMLElement, append it after the header
    if (typeof options.body !== 'string' && options.body instanceof HTMLElement) {
      const modal = overlay.querySelector('.modal')!;
      const existingHeader = modal.querySelector('.modal-header');
      const container = document.createElement('div');
      container.style.padding = pad;
      container.appendChild(options.body);
      if (existingHeader) {
        existingHeader.after(container);
      } else {
        modal.prepend(container);
      }
    }

    document.body.appendChild(overlay);

    // Focus trap — collect focusable elements in the dialog
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => {
      const modal = overlay.querySelector('.modal');
      if (!modal) return [];
      const els = modal.querySelectorAll<HTMLElement>(focusableSelector);
      return Array.from(els).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
    };

    // Focus first primary button, else first button, else X button
    const setInitialFocus = () => {
      const focusable = getFocusable();
      const primary = focusable.find(el => el.matches('.btn-primary'));
      if (primary) { primary.focus(); return; }
      if (focusable.length) focusable[0].focus();
    };

    // requestAnimationFrame ensures overlay is in DOM before focus
    requestAnimationFrame(() => setInitialFocus());

    // Button clicks
    overlay.querySelectorAll('[data-dialog-value]').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = (btn as HTMLElement).dataset.dialogValue;
        finish(value ?? null);
      });
    });

    // X button
    overlay.querySelectorAll('[data-dialog-close]').forEach(btn => {
      btn.addEventListener('click', () => finish(null));
    });

    // Backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null);
    });

    // Keyboard: Escape → close, Enter → primary button, Tab → focus trap
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        finish(null);
        return;
      }
      if (e.key === 'Enter') {
        // Activate primary button or first focusable button
        const focusable = getFocusable();
        const primary = focusable.find(el => el.matches('.btn-primary'));
        if (primary) { primary.click(); return; }
        if (focusable.length) { focusable[0].click(); return; }
        return;
      }
      if (e.key === 'Tab') {
        const focusable = getFocusable();
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', keyHandler);

    // Lock body scroll
    document.body.style.overflow = 'hidden';
  });
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
