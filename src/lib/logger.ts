import { invoke } from '@tauri-apps/api/core';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogContext = Record<string, unknown>;

const isDev = import.meta.env.DEV;
let didWarnBridgeFailure = false;

function send(level: LogLevel, scope: string, message: string, context?: LogContext) {
  if (level === 'debug' && !isDev) return;
  const payload = context && Object.keys(context).length > 0
    ? { level, scope, message, context }
    : { level, scope, message };
  void invoke('log_frontend_event', payload).catch((error) => {
    if (!isDev || didWarnBridgeFailure) return;
    didWarnBridgeFailure = true;
    console.warn('Failed to forward frontend log event', error);
  });
}

function toErrorContext(error: unknown): LogContext {
  if (error instanceof Error) {
    const context: LogContext = {
      name: error.name,
      message: error.message,
    };
    if (isDev && error.stack) {
      context.stack = error.stack;
    }
    return context;
  }
  return { error: String(error) };
}

export function logDebug(scope: string, message: string, context?: LogContext) {
  send('debug', scope, message, context);
}

export function logInfo(scope: string, message: string, context?: LogContext) {
  send('info', scope, message, context);
}

export function logWarn(scope: string, message: string, context?: LogContext) {
  send('warn', scope, message, context);
}

export function logError(scope: string, message: string, context?: LogContext) {
  send('error', scope, message, context);
}

export function logException(scope: string, message: string, error: unknown, context: LogContext = {}) {
  logError(scope, message, { ...context, ...toErrorContext(error) });
}
