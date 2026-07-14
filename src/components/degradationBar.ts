// ── Degradation Bar ──────────────────────────────────────────────────

const BAR_ID = 'degradation-bar';

export interface DegradationInfo {
  tier: 'large' | 'huge';
  size: string;
  lines: number;
  readOnly?: boolean;
}

export function showDegradationBar(info: DegradationInfo): void {
  hideDegradationBar();

  const bar = document.createElement('div');
  bar.id = BAR_ID;
  bar.className = 'degradation-bar';

  const icon = document.createElement('span');
  icon.className = 'degradation-icon';
  icon.textContent = '⚠️';
  bar.appendChild(icon);

  const msg = document.createElement('span');
  msg.className = 'degradation-message';
  if (info.readOnly) {
    msg.textContent = `只读模式 — 文件过大 (${info.size}, ${info.lines} 行)，已禁用编辑`;
  } else {
    msg.textContent = `大文件模式 (${info.size}, ${info.lines} 行) — 建议切换到源码编辑器`;
  }
  bar.appendChild(msg);

  const actions = document.createElement('span');
  actions.className = 'degradation-actions';

  // Add a switch-to-source button for large files
  if (!info.readOnly) {
    const switchBtn = document.createElement('button');
    switchBtn.className = 'btn-secondary degradation-btn';
    switchBtn.textContent = '切换到源码模式';
    switchBtn.addEventListener('click', () => {
      import('../lib/editor').then(mod => {
        if (mod.getMode() !== 'source') {
          mod.switchToSource();
        }
      });
    });
    actions.appendChild(switchBtn);
  }

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'degradation-close';
  dismissBtn.setAttribute('aria-label', '关闭');
  dismissBtn.innerHTML = '✕';
  dismissBtn.addEventListener('click', () => hideDegradationBar());
  actions.appendChild(dismissBtn);

  bar.appendChild(actions);

  const editorArea = document.getElementById('editor-area');
  if (editorArea) {
    editorArea.prepend(bar);
  }
}

export function hideDegradationBar(): void {
  const existing = document.getElementById(BAR_ID);
  if (existing) existing.remove();
}
