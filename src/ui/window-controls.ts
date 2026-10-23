import { getCurrentWindow, type Window } from '@tauri-apps/api/window';
import { logException } from '../infra/logger';

const SCOPE = 'window.controls';

/**
 * Undecorated windows (Windows/Linux) have no system title bar, so the toolbar
 * row acts as one: show the window control buttons, mark the blank toolbar
 * areas as drag regions, and keep the maximize/restore icon in sync.
 * Decorated windows (macOS, browser dev) return early and nothing changes.
 * Any failure keeps the buttons hidden and logs — the editor must still boot.
 */
export async function initWindowControls(): Promise<void> {
  const controls = document.getElementById('window-controls');
  if (!controls) return;
  try {
    const appWindow = getCurrentWindow();
    // Gate on the window's real decoration state, not platform sniffing, so
    // macOS (system title bar) and the browser dev server are covered for free.
    if (await appWindow.isDecorated()) return;

    controls.hidden = false;
    document.getElementById('toolbar')?.classList.add('has-window-controls');
    for (const el of document.querySelectorAll<HTMLElement>('#toolbar, #toolbar .toolbar-spacer, #toolbar .toolbar-separator')) {
      el.setAttribute('data-tauri-drag-region', '');
    }

    bindWindowButton('win-minimize', 'minimize window', () => appWindow.minimize());
    bindWindowButton('win-maximize', 'toggle maximize window', () => appWindow.toggleMaximize());
    // close() (not destroy) so the Rust CloseRequested interception and the
    // unsaved-document confirm flow still apply.
    bindWindowButton('win-close', 'close window', () => appWindow.close());

    await syncMaximizeIcon(appWindow);
    Promise.resolve(
      appWindow.onResized(() => {
        void syncMaximizeIcon(appWindow);
      }),
    ).catch((error) => logException(SCOPE, 'Failed to listen for window resize', error));
  } catch (error) {
    controls.hidden = true;
    logException(SCOPE, 'Failed to initialize window controls', error);
  }
}

function bindWindowButton(id: string, message: string, action: () => Promise<void>) {
  document.getElementById(id)?.addEventListener('click', () => {
    // Promise.resolve keeps a failing window API from becoming an unhandled rejection.
    Promise.resolve(action()).catch((error) => logException(SCOPE, `Failed to ${message}`, error));
  });
}

async function syncMaximizeIcon(appWindow: Window) {
  const button = document.getElementById('win-maximize');
  if (!button) return;
  try {
    const maximized = await appWindow.isMaximized();
    button.querySelector('.icon-maximize')?.toggleAttribute('hidden', maximized);
    button.querySelector('.icon-restore')?.toggleAttribute('hidden', !maximized);
  } catch (error) {
    logException(SCOPE, 'Failed to sync maximize state icon', error);
  }
}
