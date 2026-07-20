import { getWordCount, getLineCount, getCursorPos } from '../lib/editor';
import { cycleTheme } from '../lib/theme';
import { store } from '../lib/store';

export function initStatusBar() {
  // WAI-ARIA: statusbar announces editor stats to screen readers
  const statusbar = document.getElementById('statusbar');
  if (statusbar) {
    statusbar.setAttribute('role', 'status');
    statusbar.setAttribute('aria-live', 'polite');
  }

  // WAI-ARIA: autosave banner announces save failures urgently
  const banner = document.getElementById('autosave-banner');
  if (banner) {
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
  }

  store.on('editor:update', updateStats);
  store.on('autosave:status', updateAutosaveBanner);

  document.getElementById('sb-settings')?.addEventListener('click', async () => {
    const { showSettings } = await import('./settings');
    showSettings();
  });

  document.getElementById('sb-focus')?.addEventListener('click', () => {
    document.getElementById('app')?.classList.toggle('focus-mode');
  });

  document.getElementById('sb-theme')?.addEventListener('click', () => {
    cycleTheme();
  });
}

function updateAutosaveBanner(event: { errorCount: number }) {
  const banner = document.getElementById('autosave-banner');
  if (!banner) return;
  if (event.errorCount >= 2) {
    banner.textContent = `自动保存失败（连续 ${event.errorCount} 次），内容未保存`;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

function updateStats() {
  const wordCount = document.getElementById('word-count');
  const lineCount = document.getElementById('line-count');
  const cursorPos = document.getElementById('cursor-pos');

  if (wordCount) wordCount.textContent = `${getWordCount()} 字`;
  if (lineCount) lineCount.textContent = `${getLineCount()} 行`;
  if (cursorPos) {
    const pos = getCursorPos();
    cursorPos.textContent = `行 ${pos.line}, 列 ${pos.col}`;
  }
}
