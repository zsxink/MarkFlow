import { workspaceStore } from './workspace/sessionWorkspaceStore';

export function AppShell() {
  return (
    <div
      data-m4-solid-shell="foundation"
      data-window-label={workspaceStore.state.windowLabel}
      data-active-session-id={workspaceStore.state.activeSessionId ?? ''}
    />
  );
}

