# Design

## Context

See proposal.md for motivation. Vite currently defines manual chunks for ProseMirror and CodeMirror. Mermaid and KaTeX have dynamic loaders. The analyzer output also reports a static import of `plantuml-lazy.ts` from `editor.extensions.ts`, which prevents Rollup from isolating it behind the dynamic import. Source mode imports CodeMirror modules through the editor module graph and may account for dependencies loaded before source mode is entered.

## Goals / Non-Goals

**Goals:**

- Keep diagram rendering, PlantUML, export, and source-mode dependencies out of ordinary startup when their current usage allows it.
- Preserve behavior and load each feature on first use.
- Base manual chunk decisions on actual initial/dynamic import paths and minified plus gzip sizes.

**Non-Goals:**

- Eliminate every 500 kB warning regardless of startup impact.
- Change editor behavior, remove supported languages or diagram types, or add dependencies.
- Split one already-lazy dependency into more chunks unless that reduces feature-load cost in a measurable way.

## Decisions

- Prefer dynamic imports at feature boundaries over arbitrary `manualChunks` entries. Manual chunks can reduce individual chunk size while leaving all bytes in the initial request graph, so they do not by themselves establish lazy loading.
- Treat source mode and editor initialization as the first candidate boundary: inspect all production callers of `editor.source` and defer CodeMirror loading only if WYSIWYG startup and shared editor utilities can remain independent.
- Remove PlantUML's static import from the WYSIWYG extension path and route the operation through the existing lazy wrapper, unless inspection shows a synchronous API requirement.
- Keep Mermaid's existing lazy loader and verify which Mermaid chunks load on first diagram render. Do not eagerly import the entire Mermaid bundle to avoid a warning.
- Record the baseline and final build sizes; accept a large editor-core warning if the dependency is required for ordinary editing and further chunking does not reduce initial transfer or execution work.

## Risks / Trade-offs

- [Dynamic loading changes timing] → Preserve async boundaries and ensure UI actions await module availability before use.
- [Multiple consumers rely on source-mode imports] → Inventory call sites and retain small shared helpers in a dependency-light module where needed.
- [More chunks increase request count] → Measure the initial import graph and feature-specific loads; avoid splits that only create requests without reducing initial bytes.

## Migration Plan

No data migration is required. Build output and analyzer report provide the before-and-after comparison. Rollback consists of reverting the focused import-boundary and build-configuration changes.

## Measured Results

The baseline build entry was 725.13 kB minified / 240.65 kB gzip, with the 407.04 kB / 132.38 kB gzip CodeMirror vendor chunk in its static import graph. After moving source-mode access behind a lazy facade, the entry is 471.35 kB / 146.39 kB gzip; the 220.73 kB / 83.13 kB source implementation and CodeMirror vendor chunk are emitted for first use of source mode. This reduces the ordinary entry transfer by about 94 kB gzip and defers the CodeMirror vendor transfer (about 132 kB gzip) until source mode is opened.

The ProseMirror vendor chunk remains 523.57 kB / 166.76 kB gzip because it is required by ordinary WYSIWYG editing. Mermaid's 704.27 kB core and 691.67 kB parser-related chunks remain dynamically loaded for diagram rendering. PlantUML now emits as a separate 34.41 kB / 12.05 kB gzip chunk. These feature chunks still trigger Vite's aggregate warning, so the warning is retained rather than hidden by changing its threshold.

## Build Warning Policy

The Vite chunk warning limit is 720 kB: high enough for the current required Mermaid core chunk (704.27 kB) while still surfacing future chunks above that size. CodeMirror's HTML, CSS, and JavaScript language packages are statically linked by Markdown mixed-language support, so their loader map uses already-loaded module exports instead of creating ineffective dynamic imports. Other language packages remain dynamically loaded. The degradation-bar switch uses the editor's existing static import because the editor module is already part of the normal application graph.
