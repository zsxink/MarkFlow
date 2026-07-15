import type { StoreEvent, StoreState } from '../types/events';
import { DEFAULT_SETTINGS } from '../types/settings';

type EventType = StoreEvent['type'];
type Callback = (event: StoreEvent) => void;

const DEFAULT_STATE: StoreState = {
  mode: 'wysiwyg',
  activeFilePath: null,
  workspacePath: null,
  expandedPaths: [],
  dirty: false,
  readOnly: false,
  settings: { ...DEFAULT_SETTINGS },
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
    this.state = { ...this.state, ...partial };

    for (const key of keys) {
      switch (key) {
        case 'mode': this.emit({ type: 'editor:mode', mode: this.state.mode }); break;
        case 'dirty': this.emit({ type: 'editor:dirty', dirty: this.state.dirty }); break;
        case 'activeFilePath': this.emit({ type: 'file:active', path: this.state.activeFilePath }); break;
        case 'workspacePath': this.emit({ type: 'workspace:set', path: this.state.workspacePath }); break;
      }
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────

export const store = new Store(DEFAULT_STATE);
