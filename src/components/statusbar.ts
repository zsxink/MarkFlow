import { getWordCount, getLineCount, getCursorPos } from '../lib/editor';
import { cycleTheme } from '../lib/theme';

export function initStatusBar() {
  document.addEventListener('editor-update', updateStats);

  document.getElementById('sb-settings')?.addEventListener('click', () => {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.hidden = false;
  });

  document.getElementById('sb-focus')?.addEventListener('click', () => {
    document.getElementById('app')?.classList.toggle('focus-mode');
  });

  document.getElementById('sb-theme')?.addEventListener('click', () => {
    cycleTheme();
  });
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
