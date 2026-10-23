// ── Document tab hooks ────────────────────────────────────────────────
//
// `active-document.ts` needs to know whether the tab model is active, and must
// delegate path rewrites/closes to it. Importing `documents/session` directly
// would close an import cycle (session -> sidebar -> active-document), so the
// tab layer registers its own implementations here instead.
//
// Defaults describe the pre-tab behaviour: a single active document with no
// tab registry, which keeps `active-document.ts` usable on its own.

export interface DocumentTabHooks {
  /** True when at least one document tab exists. */
  hasOpenDocumentTabs: () => boolean;
  /** Rewrite every tab path under `from` to `to`. */
  rewriteDocumentTabPaths: (from: string, to: string) => void;
  /** Close every tab whose path is `path` or below it. */
  closeDocumentTabsMatchingPath: (path: string) => Promise<boolean>;
  /** Discard the current tab (used by the external-deletion path). */
  discardCurrentDocumentTabInOperation: () => Promise<unknown>;
}

const defaults: DocumentTabHooks = {
  hasOpenDocumentTabs: () => false,
  rewriteDocumentTabPaths: () => {},
  closeDocumentTabsMatchingPath: async () => false,
  discardCurrentDocumentTabInOperation: async () => {},
};

let hooks: DocumentTabHooks = { ...defaults };

/** Called once by `documents/session.ts` when the tab model is loaded. */
export function registerDocumentTabHooks(implementations: Partial<DocumentTabHooks>): void {
  hooks = { ...hooks, ...implementations };
}

/** Restore defaults; used by tests to isolate hook state. */
export function resetDocumentTabHooks(): void {
  hooks = { ...defaults };
}

export const documentTabHooks = {
  hasOpenDocumentTabs: () => hooks.hasOpenDocumentTabs(),
  rewriteDocumentTabPaths: (from: string, to: string) => hooks.rewriteDocumentTabPaths(from, to),
  closeDocumentTabsMatchingPath: (path: string) => hooks.closeDocumentTabsMatchingPath(path),
  discardCurrentDocumentTabInOperation: () => hooks.discardCurrentDocumentTabInOperation(),
};
