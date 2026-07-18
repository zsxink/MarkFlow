## Context

Mermaid is already rendered through a dynamically loaded ProseMirror code-block node view. PlantUML differs because its renderer is a user-selected remote server: the diagram source must be encoded into a server URL and the returned SVG is untrusted content. The feature must remain entirely opt-in so an unopened setting never transmits document text.

## Goals / Non-Goals

**Goals:**

- Persist an empty-by-default PlantUML server address and communicate its privacy implications.
- Replace configured `plantuml` code blocks with a lazy-rendered, cached SVG view and a visible loading state.
- Build request URLs without string interpolation hazards, bound request time, sanitize SVG before DOM insertion, and preserve source as the failure fallback.

**Non-Goals:**

- Bundling a PlantUML Java renderer, supplying a hosted service, supporting non-SVG output, or changing Mermaid behavior.
- Sending any PlantUML source when the address is empty.

## Decisions

### Use the existing code-block node-view pattern

PlantUML will extend the existing diagram node view rather than introduce a second editor extension. This preserves source fallback and makes the lazy-load trigger precise. Alternative: parse diagrams at document load; rejected because it eagerly loads code and risks requesting off-screen diagrams.

### Use a small dynamically imported PlantUML client

`plantuml.ts` will import `plantuml-lazy.ts`; the lazy module owns a cached promise and the PlantUML URL encoding/fetch path. Vite will split it out of the main entry. Alternative: install a browser PlantUML dependency; rejected because server rendering needs only a small encoder/client and a dependency would add unnecessary main-bundle risk.

### Request SVG using a validated URL and sanitize it before insertion

The client will parse the configured address with `URL`, normalize it to a base path, encode source using PlantUML's deflate format, request the `svg/<encoded>` endpoint with a timeout, validate an SVG response, and remove executable/remote-link SVG content. It will use `textContent` for messages and only assign sanitized SVG markup. Alternative: direct `img.src`; rejected because it offers less controlled failure handling and does not allow sanitizing untrusted SVG.

### Keep source fallback visible for every failure mode

The node view starts as a normal code block and upgrades only after successful rendering. Empty or invalid settings, failed requests, and malformed SVG therefore preserve readable source without hidden network behavior.

## Risks / Trade-offs

- [External servers receive diagram source] → Empty-by-default setting and explicit warning with self-hosted recommendation.
- [CORS or network availability prevents rendering] → Request timeout, clear error state, and source fallback.
- [SVG is active content] → DOMParser-based allowlist-style cleanup and no unsanitized HTML insertion.
- [Large diagrams create long URLs] → Limit source size before encoding and report a recoverable error.

## Migration Plan

Existing settings deserialize the new field to an empty string, so no migration action is required. Removing the setting or clearing its value immediately restores code-block-only behavior. Rollback consists of removing the frontend renderer; persisted unknown settings fields remain harmless.

## Open Questions

- None; the server endpoint, opt-in behavior, and fallback are defined by Issue #9.
