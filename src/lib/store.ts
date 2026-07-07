// ── Event types ──────────────────────────────────────────────────────

export type StoreEvent =
  | { type: 'editor:update' }
  | { type: 'editor:dirty'; dirty: boolean }
  | { type: 'editor:mode'; mode: 'wysiwyg' | 'source' }
  | { type: 'file:active'; path: string | null }
  | { type: 'settings:changed'; settings: Record<string, unknown> }
  | { type: 'workspace:set'; path: string | null };

type EventType = StoreEvent['type'];
type Callback = (event: StoreEvent) => void;

// ── State ────────────────────────────────────────────────────────────

export interface StoreState {
  mode: 'wysiwyg' | 'source';
  activeFilePath: string | null;
  workspacePath: string | null;
  expandedPaths: string[];
  dirty: boolean;
  cachedSourceGutterStyles: Record<string, string> | null;
  settings: Record<string, unknown>;
}

const DEFAULT_STATE: StoreState = {
  mode: 'wysiwyg',
  activeFilePath: null,
  workspacePath: null,
  expandedPaths: [],
  dirty: false,
  cachedSourceGutterStyles: null,
  settings: {},
};

// ── Store implementation ─────────────────────────────────────────────

class Store {
  private listeners = new Map<EventType, Set<Callback>>();
  private state: StoreState;

  constructor(initial: StoreState) {
    this.state = { ...initial };
  }

  on<T extends EventType>(type: T, cb: (event: Extract<StoreEvent, { type: T }>) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(cb as Callback);
  }

  off<T extends EventType>(type: T, cb: (event: Extract<StoreEvent, { type: T }>) => void): void {
    this.listeners.get(type)?.delete(cb as Callback);
  }

  emit(event: StoreEvent): void {
    this.listeners.get(event.type)?.forEach(cb => {
      try { cb(event); } catch { /* isolate listener errors */ }
    });
  }

  getState(): StoreState {
    return { ...this.state };
  }

  setState(partial: Partial<StoreState>): void {
    const keys = Object.keys(partial) as (keyof StoreState)[];
    if (keys.length === 0) return;

    for (const key of keys) {
      (this.state as any)[key] = partial[key];
    }

    // Emit events for state keys that have corresponding event types
    for (const key of keys) {
      switch (key) {
        case 'mode':
          this.emit({ type: 'editor:mode', mode: this.state.mode });
          break;
        case 'activeFilePath':
          this.emit({ type: 'file:active', path: this.state.activeFilePath });
          break;
        case 'workspacePath':
          this.emit({ type: 'workspace:set', path: this.state.workspacePath });
          break;
        case 'dirty':
          this.emit({ type: 'editor:dirty', dirty: this.state.dirty });
          break;
      }
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────

export const store = new Store(DEFAULT_STATE);
