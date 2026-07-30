import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createToastRouteContext, showRoutedToast } from './notifications';

const mocks = vi.hoisted(() => ({
  currentWindow: { label: 'main' },
  sessionState: { isActive: true, sessionId: 7 },
  showToast: vi.fn(),
  logDebug: vi.fn(),
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => mocks.currentWindow,
}));

vi.mock('../lib/coreSession', () => ({
  getCoreSessionState: () => mocks.sessionState,
}));

vi.mock('../components/toast', () => ({
  showToast: mocks.showToast,
}));

vi.mock('../lib/logger', () => ({
  logDebug: mocks.logDebug,
}));

describe('App Service routed toast', () => {
  beforeEach(() => {
    mocks.currentWindow.label = 'main';
    mocks.sessionState = { isActive: true, sessionId: 7 };
    mocks.showToast.mockReset();
    mocks.logDebug.mockReset();
  });

  it('routes toast when request window and session still match', () => {
    const routed = showRoutedToast(
      '完成',
      { requestId: 'req-1', windowLabel: 'main', sessionId: 7 },
    );

    expect(routed).toBe(true);
    expect(mocks.showToast).toHaveBeenCalledWith('完成');
  });

  it('drops toast for a different window', () => {
    const routed = showRoutedToast(
      '完成',
      { requestId: 'req-1', windowLabel: 'secondary', sessionId: 7 },
    );

    expect(routed).toBe(false);
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(mocks.logDebug).toHaveBeenCalledWith(
      'app.notifications',
      'Dropping toast for mismatched window',
      expect.objectContaining({ requestId: 'req-1' }),
    );
  });

  it('drops toast for a stale active session', () => {
    mocks.sessionState = { isActive: true, sessionId: 8 };

    const routed = showRoutedToast(
      '完成',
      { requestId: 'req-1', windowLabel: 'main', sessionId: 7 },
    );

    expect(routed).toBe(false);
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(mocks.logDebug).toHaveBeenCalledWith(
      'app.notifications',
      'Dropping toast for stale session',
      expect.objectContaining({ requestId: 'req-1' }),
    );
  });

  it('creates context from current window and active session', () => {
    expect(createToastRouteContext({ requestId: 'toast-1' })).toEqual({
      requestId: 'toast-1',
      windowLabel: 'main',
      sessionId: 7,
    });
  });
});
