// ── Opaque session lifecycle (task 7.6 / design Decision 5) ───────────────
//
// One opaque registry is alive per WYSIWYG session. It must be torn down (and
// its handle removed from the parser) whenever the session ends: document
// switch, reload, pipeline degrade and editor destroy. After teardown an old
// sentinel can never be resolved — a fresh registry does not know its slots, so
// a stale atom node or a pasted token from the previous document becomes plain
// user text (never an internal node) and restore reports it as a conflict.
//
// The controller owns the current registry and the active parser handle.

import { OpaqueRegistry } from './index';
import { renderOpaque } from './bridge';
import { setActiveOpaqueRegistry } from './extension';
import type { MarkdownSession } from '../types';

let currentRegistry: OpaqueRegistry | null = null;
let currentSession: MarkdownSession | null = null;

/** The registry of the live opaque session, if any. */
export function getOpaqueRegistry(): OpaqueRegistry | null {
  return currentRegistry;
}

/** The session baselines of the live opaque session, if any. */
export function getOpaqueSession(): MarkdownSession | null {
  return currentSession;
}

/**
 * Render `source` into sentinel form and install the resulting session
 * registry as the active one. Returns the same result as `renderOpaque`, with
 * the registry available via `getOpaqueRegistry()` afterwards.
 */
export function beginOpaqueSession(
  source: string,
): ReturnType<typeof renderOpaque> {
  // A new session replaces (and clears) any previous one atomically.
  endOpaqueSession();
  const result = renderOpaque(source);
  if (result.ok) {
    currentRegistry = result.registry;
    setActiveOpaqueRegistry(result.registry);
  }
  return result;
}

/**
 * Tear down the live opaque session: clear + roll the registry nonce and
 * remove the active parser handle. Old slots become unresolvable immediately.
 */
export function endOpaqueSession(): void {
  if (currentRegistry) currentRegistry.clear();
  currentRegistry = null;
  currentSession = null;
  setActiveOpaqueRegistry(null);
}

/**
 * Install an already-built registry as the active session (used by the
 * admission integration, which runs its own render+verify before committing).
 */
export function installOpaqueRegistry(registry: OpaqueRegistry): void {
  endOpaqueSession();
  currentRegistry = registry;
  setActiveOpaqueRegistry(registry);
}

/** Commit a full session (registry + baselines) atomically. */
export function installOpaqueSession(session: MarkdownSession, registry: OpaqueRegistry): void {
  installOpaqueRegistry(registry);
  currentSession = session;
}

/**
 * Degrade the session to `source-only` when the pipeline falls below `opaque`:
 * the WYSIWYG representation is no longer trusted, so no opaque holder may
 * remain active and the document must reload from exact Source.
 */
export function onPipelineModeChanged(mode: string): void {
  // Every verified save-boundary mode owns the same MarkdownSession. `gated`
  // is retained for compatibility and must not silently discard it.
  if (mode !== 'gated' && mode !== 'opaque' && mode !== 'reconcile') {
    endOpaqueSession();
  }
}

/** Suspended documents retain their registry nonce and authored RAW spans. */
export interface OpaqueSessionContext {
  registry: OpaqueRegistry | null;
  session: MarkdownSession | null;
}
export function detachOpaqueSession(): OpaqueSessionContext {
  const context = { registry: currentRegistry, session: currentSession };
  currentRegistry = null;
  currentSession = null;
  setActiveOpaqueRegistry(null);
  return context;
}
export function attachOpaqueSession(context: OpaqueSessionContext): void {
  currentRegistry = context.registry;
  currentSession = context.session;
  setActiveOpaqueRegistry(currentRegistry);
}
export function releaseOpaqueSession(context: OpaqueSessionContext): void {
  context.registry?.clear();
  context.registry = null;
  context.session = null;
}
