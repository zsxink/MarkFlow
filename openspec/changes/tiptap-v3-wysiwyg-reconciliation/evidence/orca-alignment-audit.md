# Orca Markdown Core Stack Alignment Audit (12.1)

## Purpose

Establish an auditable mapping between the Complete B contract (per design.md Decision 2)
and the MarkFlow implementation, confirming each layer is carried by the authoritative
code path. This document is the single source of truth for task 12.1.

## Alignment Matrix

| # | Orca Contract Layer | Contract Requirement | MarkFlow Implementation | File(s) | Audit Status |
|---|---|---|---|---|---|
| 1 | **Editor model** | TipTap / ProseMirror v3 | All `@tiptap/*` pinned to **3.30.5**; ProseMirror v3 as document model | `package.json` (lines 40-48), `package-lock.json` | ✅ PASS |
| 2 | **Markdown engine** | First-party `@tiptap/markdown` using the Marked token model | `@tiptap/markdown@3.30.5` registered via `createMarkdownExtension()` with a Marked instance | `editor.init.ts:57-60` | ✅ PASS |
| 3 | **Parser ownership** | One bridge-owned, isolated Marked-compatible instance/facade | Bridge-owned Marked instance (`markflowMarked`) with `gfm: true, breaks: false`; never shared across editor instances or tests | `editor.init.ts:51-54` | ✅ PASS |
| 4 | **Markdown entry** | `setContent(..., { contentType: 'markdown' })` behind the adapter | Single `parseTipTapMarkdown()` calls `editor.commands.setContent(source, { contentType: 'markdown' })`; no other parse entry point | `editor.markdown.adapter.ts:125-133` | ✅ PASS |
| 5 | **Extension integration** | `markdownTokenizer` and `renderMarkdown` for authored syntax | OpaqueNode extension registers `markdownTokenizer` (sentinel recognition), `parseMarkdown` (sentinel resolution), and `renderMarkdown` (sentinel emission) | `editor.markdown.opaque.extension.ts` | ✅ PASS |
| 6 | **Safety pipeline** | Eligibility admission → opaque placeholder registry/atom → three-way reconcile → Source recovery | Full pipeline implemented: `classifyEligibility` → `admitOpaque` → `reconcile` → Source fallback | See §3 below | ✅ PASS |

## Detailed Component Mapping

### 3.1 Eligibility Admission

| Component | Contract | Implementation | File |
|---|---|---|---|
| Source scanning | Scan for supported/unsupported constructs | `classifyEligibility(source)` — scans opaque spans, code regions, unsupported constructs | `editor.markdown.eligibility.ts` |
| Opaque allowlist | YAML frontmatter, block HTML, HTML comments | `scanOpaqueSpans()` returns `[from, to)` ranges for these three categories | `editor.markdown.opaque.ts` |
| Unsupported detection | Reference links, footnotes, inline HTML, math, malformed tables | Parsed on masked prose (code regions blanked), with GFM table column-count validation | `editor.markdown.eligibility.ts` |
| Verdict | `eligible` / `eligible-with-opaque` / `source-only` | Discriminated union `EligibilityResult` with stable `EligibilityReason` codes | `editor.markdown.types.ts` |

### 3.2 Opaque Placeholder Registry/Atom

| Component | Contract | Implementation | File |
|---|---|---|---|
| Scanner | Precise range scanner for frontmatter, block HTML, HTML comments | `scanOpaqueSpans(source, codeRegions)` with unclosed/crossing boundary rejection | `editor.markdown.opaque.ts` |
| Sentinel generation | Session nonce + index, user-collision-resistant | `OpaqueRegistry` class with random nonce, FNV-1a digest, `sentinelFor()` | `editor.markdown.opaque.ts` |
| Atom node | Non-editable TipTap node holding slot/category only | `OpaqueNode` extension with `markdownTokenizer`, `parseMarkdown`, `renderMarkdown` hooks | `editor.markdown.opaque.extension.ts` |
| Render/restore | Replace raw→sentinels, restore sentinels→raw with integrity check | `renderOpaque()` / `restoreOpaque()` — one-to-one, ordered, digest-verified | `editor.markdown.opaque.bridge.ts` |
| Clipboard | Serialize to raw Markdown, not sentinels | `resolveClipboardOpaque()` replaces sentinels with raw payloads before clipboard write | `editor.markdown.opaque.clipboard.ts` |
| Session lifecycle | Clear registry on document switch/reload/pipeline degrade/editor destroy | `endOpaqueSession()` + `onPipelineModeChanged()` hook | `editor.markdown.opaque.session.ts` |

### 3.3 Three-Way Reconcile

| Component | Contract | Implementation | File |
|---|---|---|---|
| Session baselines | sourceBaseline, verifiedRenderBaseline, baselineFingerprint, sourceRevision, userRevision | `createMarkdownSession()` captures all fields from one admission transaction | `editor.markdown.reconcile.ts` |
| Reconcile classifier | `unchanged` / `safe-edit` / `conflict` with sub-codes | `reconcile(input)` — pure function, 5 conflict codes | `editor.markdown.reconcile.ts` |
| Dirty derivation | Only from successful candidate vs persisted baseline | `deriveDirtyFromCandidate(candidate, baseline)` | `editor.save.reconcile.ts` |
| Autosave suppression | Conflict state suppresses autosave | `shouldSuppressAutosave(conflictCode)` | `editor.save.reconcile.ts` |
| Source recovery | User can always view/edit full original Markdown | Source mode shows raw content, no sentinels, no internal metadata | `editor.ts:switchToSource()` |

### 3.4 Semantic Fingerprint + Canonicalization

| Component | Contract | Implementation | File |
|---|---|---|---|
| Fingerprint | Runtime-attribute-stripped JSON digest | `semanticFingerprint(doc)` strips null/default attributes, normalizes mark order | `editor.markdown.fingerprint.ts` |
| Canonicalization | Registered set of allowed format-only differences | 7 named canonicalizations (link-href, table-padding, pipe-escaping, file-tail-newline, soft-break, list-continuation, code-trailing-newline) | `editor.markdown.fingerprint.ts` |
| Admission verification | parse→serialize→restore→parse + fingerprint comparison | `verifyAdmission()` + `admitOpaque()` round-trip verification | `editor.markdown.admission.ts`, `editor.markdown.opaque.integration.ts` |

## Allowed Differences (Non-Alignment Deviations)

| # | Deviation | Rationale | Impact |
|---|---|---|---|
| A1 | MarkFlow uses its own TipTap v3 patch (3.30.5), not necessarily the same as Orca | Patch selection based on MarkFlow's corpus verification; no patch lockstep required | None — same API surface |
| A2 | MarkFlow retains Tauri + native TypeScript application shell | Application shell is explicitly out of scope for alignment | None — product-level difference |
| A3 | Orca-specific UI components (React, KaTeX, Live Preview) not present | Explicitly excluded per design.md Decision 2 | None — product-level difference |
| A4 | Automatic external-edit merge not implemented | Explicitly excluded per design.md non-goals | None — feature-level difference |

## Dependency Verification

| Check | Command | Expected | Status |
|---|---|---|---|
| All @tiptap/* pinned to same v3 patch | `npm ls @tiptap/core @tiptap/markdown @tiptap/pm` | All 3.30.5, no peer conflicts | ✅ PASS |
| No legacy tiptap-markdown | `grep -r "tiptap-markdown" package.json package-lock.json` | Zero matches | ✅ PASS |
| No direct storage.markdown access | Static scan of `src/lib/*.ts` (non-test) | Only adapter comments, no live code | ✅ PASS (gate test) |
| No markdown-it in prod source | Static scan of `src/lib/*.ts` (non-test) | Zero imports | ✅ PASS (gate test) |
| No bypass of bridge/adapter | Static scan for `.getMarkdown()` / `contentType.*markdown` outside adapter/bridge | Zero matches | ✅ PASS (gate test) |

## Conclusion

All six Orca contract layers are carried by the current MarkFlow implementation.
The bridge is the single authoritative entry point for all Markdown operations.
The eligibility → opaque → reconcile safety pipeline is fully implemented and tested.
Four allowed deviations are product-level differences that do not affect the
Markdown core stack alignment.
