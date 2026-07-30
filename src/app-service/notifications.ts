import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { showToast } from '../components/toast';
import { getCoreSessionState } from '../lib/coreSession';
import { logDebug } from '../lib/logger';

export interface ToastRouteContext {
  requestId: string;
  windowLabel: string;
  sessionId?: number;
}

export interface ToastRouteOptions {
  duration?: number;
  currentWindowLabel?: () => string;
  activeSessionId?: () => number | null;
  toast?: (message: string, duration?: number) => void;
}

let toastRequestCounter = 0;

function nextToastRequestId(): string {
  toastRequestCounter += 1;
  return `toast_${Date.now()}_${toastRequestCounter}`;
}

function defaultCurrentWindowLabel(): string {
  try {
    return getCurrentWebviewWindow().label;
  } catch {
    // Unit tests and non-Tauri harnesses do not have window metadata. Keep a
    // deterministic label so routed UI toasts can still be validated without
    // claiming OS-level notification support.
    return 'main';
  }
}

function defaultActiveSessionId(): number | null {
  const session = getCoreSessionState();
  return session.isActive ? session.sessionId : null;
}

export function createToastRouteContext(input?: {
  requestId?: string;
  windowLabel?: string;
  sessionId?: number;
}): ToastRouteContext {
  const sessionId = input?.sessionId ?? defaultActiveSessionId() ?? undefined;
  return {
    requestId: input?.requestId ?? nextToastRequestId(),
    windowLabel: input?.windowLabel ?? defaultCurrentWindowLabel(),
    sessionId,
  };
}

export function showRoutedToast(
  message: string,
  context: ToastRouteContext,
  options?: ToastRouteOptions,
): boolean {
  const currentWindowLabel = options?.currentWindowLabel?.() ?? defaultCurrentWindowLabel();
  if (currentWindowLabel !== context.windowLabel) {
    logDebug('app.notifications', 'Dropping toast for mismatched window', {
      requestId: context.requestId,
      expectedWindowLabel: context.windowLabel,
      currentWindowLabel,
    });
    return false;
  }

  const activeSessionId = options?.activeSessionId?.() ?? defaultActiveSessionId();
  if (
    typeof context.sessionId === 'number'
    && activeSessionId !== null
    && activeSessionId !== context.sessionId
  ) {
    logDebug('app.notifications', 'Dropping toast for stale session', {
      requestId: context.requestId,
      expectedSessionId: context.sessionId,
      activeSessionId,
    });
    return false;
  }

  const toast = options?.toast ?? showToast;
  if (typeof options?.duration === 'number') {
    toast(message, options.duration);
  } else {
    toast(message);
  }
  return true;
}
