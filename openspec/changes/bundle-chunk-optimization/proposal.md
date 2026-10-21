# Proposal

## Why

The production build emits several JavaScript chunks above Vite's 500 kB warning threshold, including an application entry chunk and large editor and diagram dependencies. The application already uses lazy loading for some libraries, but build diagnostics show that at least one PlantUML lazy import is defeated by a static import; reducing work on the ordinary startup path can improve launch responsiveness and clarify which large chunks are unavoidable.

## What Changes

- Identify dependencies in the initial application path that are only needed for specific editor modes or actions and defer them where safe.
- Remove static imports that prevent existing PlantUML lazy loading from taking effect.
- Review Mermaid and editor vendor chunk loading boundaries, preserving lazy loading for diagrams and avoiding arbitrary chunking solely to suppress warnings.
- Record before-and-after minified and gzip sizes, and retain warnings for large chunks that are required on the normal path.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a performance-oriented bundling refactor with no intended change to user-visible behavior.

## Impact

Potentially affected areas include `src/lib/editor.ts`, editor initialization and source-mode loading, PlantUML extensions, Vite/Rollup build configuration, and the bundle analysis/size reporting workflow. No new runtime dependency or public API is intended.
