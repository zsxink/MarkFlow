import { getWordCount, getLineCount, getCursorPos } from '../lib/editor';
import { cycleTheme } from '../lib/theme';
import { store } from '../lib/store';

export function initStatusBar() {
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
