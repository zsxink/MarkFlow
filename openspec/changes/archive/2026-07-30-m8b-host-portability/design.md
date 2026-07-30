## Context

M8A introduced Export IR and moved the primary export input toward Core confirmed snapshots. The remaining portability problem is that platform side effects are still split across Tauri commands, frontend call sites, and a narrow Runtime filesystem `Host` trait. Some calls still rely on active UI/window/path context or return raw platform errors, which makes non-Tauri validation weak and increases the risk of stale results being applied to the wrong document or window.

M8B stabilizes the contract between Runtime and Host before removing legacy paths in M8C. Runtime remains the workflow owner for sessions, save/export/asset/task lifecycle, cancellation, timeout, and stale result rejection. Host becomes the platform side-effect executor.

## Goals / Non-Goals

**Goals:**

- Define versioned Host request context and capability negotiation shared by Tauri Host and mock Host.
- Establish stable Host/export error code registry and serialization compatibility tests.
- Cover file system, clipboard, dialogs, windows, notifications, shell, network, render, and export as Host capabilities.
- Add a deterministic non-Tauri mock Host harness for protocol and workflow tests.
- Keep document side effects bound to `sessionId + revision + requestId`; window-related side effects also bind `clientId + windowLabel`.
- Map Host capability matrix to Tauri v2 capabilities/permissions and detect drift.
- Provide a minimal non-Tauri harness for inspect/search/diagnostics/html export without bypassing Runtime session lifecycle.

**Non-Goals:**

- Do not delete ProseMirror serializer save paths or legacy DOM export fallback; that remains M8C.
- Do not replace the desktop Tauri product with a CLI.
- Do not require PDF/DOCX adapters to be rewritten in Rust.
- Do not introduce a public plugin system.

## Decisions

### Decision 1: Host context is a Runtime protocol DTO, not a Tauri DTO

`HostRequestContext` lives in `markflow-runtime` and carries protocol version, request id, client id, optional window label, optional session/document/revision identity, and requested capability.

Rationale: Runtime owns session and workflow state. If the context is defined only in `src-tauri`, mock Host and CLI harness tests cannot prove the same contract.

Alternative considered: keep context in Tauri command DTOs only. Rejected because it preserves Tauri as the source of truth and prevents non-Tauri protocol tests.

### Decision 2: Capabilities are explicit and negotiated

Host declares `file_system`, `clipboard`, `dialogs`, `windows`, `notifications`, `shell`, `network`, `render`, and `export`. Each call validates required session/window/revision scope before performing side effects.

Rationale: Missing capability, permission denied, user denied, temporary failure, and unsupported platform must be distinguishable. Silent fallback is not acceptable for M8B.

Alternative considered: infer support from command availability. Rejected because it cannot represent denied permissions or per-window restrictions.

### Decision 3: Runtime keeps workflow ownership

Runtime coordinates open/save/asset/export/search/diagnostics task lifecycle and validates stale results before applying them. Host may read/write files, open dialogs, render diagrams, fetch network resources, and perform platform export output, but it does not own Core revision, dirty state, Markdown generation, active editor state, or fallback policy.

Rationale: This preserves Markdown source as the only persistent truth and keeps portability possible across Tauri, CLI, tests, and future hosts.

Alternative considered: let Host commands perform end-to-end workflows. Rejected because it repeats the current active-window/path coupling.

### Decision 4: Mock Host is deterministic and protocol-first

The first non-Tauri harness is a deterministic mock Host that validates capabilities, permission outcomes, window/session/revision scope, cancellation, and stale routing. It does not need to emulate full OS behavior.

Rationale: M8B needs repeatable tests for contract failures. OS behavior can be covered separately by Tauri Host smoke tests.

Alternative considered: start with a user-facing CLI only. Rejected because a CLI can accidentally bypass Runtime workflow rules and still appear portable.

### Decision 5: Migration is incremental behind compatibility boundaries

Existing Tauri commands are migrated capability by capability. Until migrated, they remain documented in a legacy allowlist with owner, risk, and removal plan. New Host-facing APIs must add matrix entries and protocol tests before UI exposure.

Rationale: M8B is broad and affects platform side effects. Incremental migration keeps review and rollback scoped.

Alternative considered: rewrite all commands into one HostPort trait in one PR. Rejected because it is high risk and hard to review.

## Risks / Trade-offs

- Host abstraction grows too broad → Keep capabilities concrete and driven by existing commands; avoid speculative ports.
- Permission matrix drifts from Tauri configuration → Add fixture/matrix tests that compare declared capabilities to Tauri v2 permission config.
- Mock Host passes but Tauri Host differs → Add shared protocol fixtures and require mock/Tauri serialization consistency tests.
- CLI harness bypasses Runtime lifecycle → Build harness on Runtime session registry and workflows, not direct Core-only shortcuts, except for explicitly Core-only inspect diagnostics.
- Export cancellation differs by platform → Document per-platform cancellation semantics and return stable `EXPORT_CANCELLED`/`EXPORT_TIMEOUT` instead of false success.
- Existing code continues to rely on active path/window → Track remaining commands in M8B evidence and legacy allowlist; fail new code without explicit context.

## Migration Plan

1. Add Host contract DTOs, capability registry, error registry, and mock Host harness in `markflow-runtime`.
2. Add protocol tests for version, missing capability, permission denied, stale session, stale revision, window mismatch, cancellation, and same-path multi-session conflict.
3. Create Host capability matrix and wire it to Tauri v2 permission/capability config tests.
4. Migrate filesystem/dialog/window/clipboard/notification/shell ports while preserving existing save conflict gates.
5. Migrate network/render/export ports, including Export IR-backed PDF/print/DOCX input routing.
6. Add non-Tauri inspect/search/diagnostics/html export harness that uses Runtime session lifecycle.
7. Update M8B evidence and feature migration matrix after each capability group.

Rollback strategy: each capability migration remains independently revertible. If a Host port fails, revert that port to the documented legacy command path while keeping protocol registry and tests.

## Open Questions

- Which Tauri permissions should be split by webview/window for clipboard image versus clipboard text?
- Should the minimal non-Tauri harness ship as a Cargo binary, an integration-test-only binary, or both?
- Which platform export operations can truly be cancelled after handing work to OS/native print APIs?
