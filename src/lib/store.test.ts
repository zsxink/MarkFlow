import { describe, expect, it, vi, beforeEach } from 'vitest';
import { store } from './store';

beforeEach(() => {
  // Reset the singleton store to defaults.
  store.setState({
    mode: 'wysiwyg',
    activeFilePath: null,
    workspacePath: null,
    expandedPaths: [],
    dirty: false,
  });
});

// ---------------------------------------------------------------------------
// on / emit
// ---------------------------------------------------------------------------

describe('on / emit', () => {
  it('calls a subscribed listener when an event is emitted', () => {
    const cb = vi.fn();
    store.on('editor:dirty', cb);

    store.setState({ dirty: true });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ type: 'editor:dirty', dirty: true });
  });

  it('does not call a listener for a different event type', () => {
    const cb = vi.fn();
    store.on('editor:dirty', cb);

    store.setState({ mode: 'source' });

    expect(cb).not.toHaveBeenCalled();
  });

  it('supports multiple listeners on the same event type', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    store.on('editor:dirty', cb1);
    store.on('editor:dirty', cb2);

    store.setState({ dirty: true });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// off
// ---------------------------------------------------------------------------

describe('off', () => {
  it('stops a listener from receiving further events', () => {
    const cb = vi.fn();
    store.on('editor:dirty', cb);

    store.setState({ dirty: true });
    expect(cb).toHaveBeenCalledTimes(1);

    store.off('editor:dirty', cb);
    store.setState({ dirty: false });

    expect(cb).toHaveBeenCalledTimes(1); // no additional call
  });

  it('is a no-op when unsubscribing a listener that was never added', () => {
    const cb = vi.fn();
    expect(() => store.off('editor:dirty', cb)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// setState
// ---------------------------------------------------------------------------

describe('setState', () => {
  it('updates the state and emits the corresponding event for mode', () => {
    const cb = vi.fn();
    store.on('editor:mode', cb);
    store.on('file:active', cb);

    store.setState({ mode: 'source' });

    expect(store.getState().mode).toBe('source');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ type: 'editor:mode', mode: 'source' });
  });

  it('updates activeFilePath and emits file:active', () => {
    const cb = vi.fn();
    store.on('file:active', cb);

    store.setState({ activeFilePath: '/doc.md' });

    expect(store.getState().activeFilePath).toBe('/doc.md');
    expect(cb).toHaveBeenCalledWith({ type: 'file:active', path: '/doc.md' });
  });

  it('updates workspacePath and emits workspace:set', () => {
    const cb = vi.fn();
    store.on('workspace:set', cb);

    store.setState({ workspacePath: '/workspace' });

    expect(store.getState().workspacePath).toBe('/workspace');
    expect(cb).toHaveBeenCalledWith({ type: 'workspace:set', path: '/workspace' });
  });

  it('is a no-op when called with an empty object', () => {
    const cb = vi.fn();
    store.on('editor:mode', cb);

    store.setState({});

    expect(cb).not.toHaveBeenCalled();
    // State unchanged from its reset value.
    expect(store.getState().mode).toBe('wysiwyg');
  });

  it('emits multiple events when multiple keys are updated at once', () => {
    const modeCb = vi.fn();
    const dirtyCb = vi.fn();
    store.on('editor:mode', modeCb);
    store.on('editor:dirty', dirtyCb);

    store.setState({ mode: 'source', dirty: true });

    expect(modeCb).toHaveBeenCalledTimes(1);
    expect(dirtyCb).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getState immutability
// ---------------------------------------------------------------------------

describe('getState', () => {
  it('returns a copy that does not mutate the internal state', () => {
    const stateCopy = store.getState();
    (stateCopy as any).mode = 'source';

    expect(store.getState().mode).toBe('wysiwyg');
  });
});

// ---------------------------------------------------------------------------
// Error isolation
// ---------------------------------------------------------------------------

describe('emit error isolation', () => {
  it('does not crash other listeners when one listener throws', () => {
    const badCb = vi.fn(() => {
      throw new Error('listener error');
    });
    const goodCb = vi.fn();
    store.on('editor:dirty', badCb);
    store.on('editor:dirty', goodCb);

    // This should not throw even though badCb throws.
    expect(() => store.setState({ dirty: true })).not.toThrow();
    expect(goodCb).toHaveBeenCalledTimes(1);
  });
});
