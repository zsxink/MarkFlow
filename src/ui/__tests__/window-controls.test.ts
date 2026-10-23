import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCurrentWindow, isDecorated, isMaximized, minimize, toggleMaximize, close, onResized, logException } = vi.hoisted(() => ({
  getCurrentWindow: vi.fn(),
  isDecorated: vi.fn(),
  isMaximized: vi.fn(),
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  onResized: vi.fn(),
  logException: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow }));
vi.mock('../../infra/logger', () => ({ logException }));

import { initWindowControls } from '../window-controls';

function buildToolbarHTML() {
  return `<div id="toolbar" class="toolbar">
    <div class="toolbar-brand" id="toolbar-menu-btn">MarkFlow</div>
    <span class="toolbar-separator"></span>
    <button class="toolbar-btn" id="btn-bold"></button>
    <span class="toolbar-separator"></span>
    <button class="toolbar-btn" id="btn-focus"></button>
    <span class="toolbar-spacer"></span>
    <div class="toolbar-window-controls" id="window-controls" hidden>
      <button class="window-control-btn" id="win-minimize" type="button" aria-label="最小化">
        <svg viewBox="0 0 24 24"></svg>
      </button>
      <button class="window-control-btn" id="win-maximize" type="button" aria-label="最大化">
        <svg class="icon-maximize" viewBox="0 0 24 24"></svg>
        <svg class="icon-restore" viewBox="0 0 24 24" hidden></svg>
      </button>
      <button class="window-control-btn window-control-close" id="win-close" type="button" aria-label="关闭">
        <svg viewBox="0 0 24 24"></svg>
      </button>
    </div>
  </div>`;
}

beforeEach(() => {
  document.body.innerHTML = buildToolbarHTML();
  vi.clearAllMocks();
  getCurrentWindow.mockReturnValue({ isDecorated, isMaximized, minimize, toggleMaximize, close, onResized });
  minimize.mockResolvedValue(undefined);
  toggleMaximize.mockResolvedValue(undefined);
  close.mockResolvedValue(undefined);
});

function controls() {
  return document.getElementById('window-controls')!;
}

function resizeHandler() {
  const calls = onResized.mock.calls;
  return calls[calls.length - 1][0] as () => void;
}

describe('window controls', () => {
  it('keeps controls hidden on a decorated window (macOS / browser)', async () => {
    isDecorated.mockResolvedValue(true);

    await initWindowControls();

    expect(controls().hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('toolbar')!.classList.contains('has-window-controls')).toBe(false);
    expect(document.getElementById('toolbar')!.hasAttribute('data-tauri-drag-region')).toBe(false);
    expect(onResized).not.toHaveBeenCalled();
  });

  it('shows controls and attaches drag regions on an undecorated window', async () => {
    isDecorated.mockResolvedValue(false);
    isMaximized.mockResolvedValue(false);

    await initWindowControls();

    expect(controls().hasAttribute('hidden')).toBe(false);
    expect(document.getElementById('toolbar')!.classList.contains('has-window-controls')).toBe(true);
    for (const selector of ['#toolbar', '.toolbar-spacer', '.toolbar-separator']) {
      expect(document.querySelector(selector)!.getAttribute('data-tauri-drag-region')).toBe('');
    }
    expect(onResized).toHaveBeenCalledOnce();
  });

  it('degrades to hidden controls and logs when isDecorated fails', async () => {
    isDecorated.mockRejectedValue(new Error('not a tauri window'));

    await initWindowControls();

    expect(controls().hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('toolbar')!.classList.contains('has-window-controls')).toBe(false);
    expect(logException).toHaveBeenCalledOnce();
  });

  it('binds the three buttons to their window APIs', async () => {
    isDecorated.mockResolvedValue(false);
    isMaximized.mockResolvedValue(false);

    await initWindowControls();

    document.getElementById('win-minimize')!.click();
    document.getElementById('win-maximize')!.click();
    document.getElementById('win-close')!.click();
    expect(minimize).toHaveBeenCalledOnce();
    expect(toggleMaximize).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not bind buttons or drag regions when initialization fails', async () => {
    isDecorated.mockRejectedValue(new Error('boom'));

    await initWindowControls();

    document.getElementById('win-minimize')!.click();
    expect(minimize).not.toHaveBeenCalled();
    expect(document.querySelector('.toolbar-spacer')!.hasAttribute('data-tauri-drag-region')).toBe(false);
  });

  it('syncs the maximize/restore icon with the window state', async () => {
    isDecorated.mockResolvedValue(false);
    isMaximized.mockResolvedValue(true);

    await initWindowControls();

    const button = document.getElementById('win-maximize')!;
    expect(button.querySelector('.icon-maximize')!.hasAttribute('hidden')).toBe(true);
    expect(button.querySelector('.icon-restore')!.hasAttribute('hidden')).toBe(false);

    isMaximized.mockResolvedValue(false);
    resizeHandler()();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(button.querySelector('.icon-maximize')!.hasAttribute('hidden')).toBe(false);
    expect(button.querySelector('.icon-restore')!.hasAttribute('hidden')).toBe(true);
  });
});
