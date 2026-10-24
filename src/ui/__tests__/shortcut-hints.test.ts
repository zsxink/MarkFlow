import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyShortcutHints, shortcutLabel } from '../shortcut-hints';

const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');
const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');

function setPlatform(platform: string, userAgent: string): void {
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  if (originalPlatform) Object.defineProperty(navigator, 'platform', originalPlatform);
  if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
});

describe('shortcutLabel', () => {
  it('renders Command chords on macOS', () => {
    setPlatform('MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(shortcutLabel('Mod+S')).toBe('⌘S');
    expect(shortcutLabel('Shift+Mod+F')).toBe('⇧⌘F');
  });

  it('renders Ctrl chords elsewhere', () => {
    setPlatform('Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(shortcutLabel('Mod+S')).toBe('Ctrl+S');
    expect(shortcutLabel('Shift+Mod+F')).toBe('Ctrl+Shift+F');
  });

  it('falls back to the UA string when the platform is empty', () => {
    setPlatform('', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(shortcutLabel('Mod+S')).toBe('⌘S');
  });
});

describe('applyShortcutHints', () => {
  it('appends the platform chord to tooltips and titles', () => {
    setPlatform('MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    document.body.innerHTML = `
      <button id="save" data-tooltip="保存" data-shortcut="Mod+S"></button>
      <button id="tabs" title="新建标签" data-shortcut="Mod+T"></button>
    `;

    applyShortcutHints();

    expect(document.getElementById('save')?.dataset.tooltip).toBe('保存 (⌘S)');
    expect(document.getElementById('tabs')?.title).toBe('新建标签 (⌘T)');
  });

  it('uses Ctrl notation on non-macOS platforms', () => {
    setPlatform('Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    document.body.innerHTML = '<button id="save" data-tooltip="保存" data-shortcut="Mod+S"></button>';

    applyShortcutHints();

    expect(document.getElementById('save')?.dataset.tooltip).toBe('保存 (Ctrl+S)');
  });

  it('is idempotent so a re-render cannot double the suffix', () => {
    setPlatform('MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    document.body.innerHTML = '<button id="save" data-tooltip="保存" data-shortcut="Mod+S"></button>';

    applyShortcutHints();
    applyShortcutHints();

    expect(document.getElementById('save')?.dataset.tooltip).toBe('保存 (⌘S)');
  });

  it('leaves elements without an accelerator untouched', () => {
    setPlatform('MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    document.body.innerHTML = '<button id="plain" data-tooltip="设置"></button>';

    applyShortcutHints();

    expect(document.getElementById('plain')?.dataset.tooltip).toBe('设置');
  });
});
