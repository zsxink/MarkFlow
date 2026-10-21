# Design

## Context

See [proposal.md](proposal.md) for motivation and scope. Issue #300 lists the audited symbols and artifacts, and explicitly excludes areas where removal could affect migrations, Rust command compatibility, or test interfaces. This change spans TypeScript, Rust, npm/Cargo manifests, build configuration, and tracked assets, so each removal must remain narrow and independently verifiable.

## Goals / Non-Goals

**Goals:**
- Remove only the specifically listed items after verifying references against the current branch.
- Preserve runtime behavior, active dependencies, and excluded compatibility/test surfaces.
- Keep lockfiles, capability configuration, chunk configuration, and ignore rules consistent with removed dependencies and generated assets.
- Run the complete TypeScript, OpenSpec, capability, and Rust validation requested by the issue.

**Non-Goals:**
- Broader dead-code cleanup beyond Issue #300's enumerated items.
- Changes to user-facing behavior, settings migration, storage commands, test-only APIs, or exported requirements.
- Removing `highlight.js` from the dependency graph where it remains a transitive dependency of `lowlight`.

## Decisions

1. **Treat the issue inventory as an allowlist.** Recheck production references before each deletion and preserve any item whose current call sites differ from the audit. This is safer than attempting a general unused-export sweep; alternatives such as broad lint-driven cleanup risk expanding scope and touching test APIs.
2. **Delete symbols surgically and preserve their containing modules.** Remove only the specified exports, the table-menu mock key, the selected Rust methods/attribute, and the logger no-op. Keep adjacent live functionality and same-file helpers intact. This avoids API or runtime changes beyond the audited remnants.
3. **Remove dependencies through their owning manifests and regenerate the lockfile.** Remove the JS fs plugin and Rust plugin registration/dependency as one coordinated update because the issue confirms no capability grants and requests both sides. Remove direct `highlight.js` only from the root manifest; retain its transitive installation through `lowlight`. Hand-editing lockfiles or removing the transitive package was rejected because it would make dependency metadata inconsistent.
4. **Delete reproducible artifacts while preserving local generated output where requested.** Remove the two unused large font files and `.large-parse.mjs`; use `git rm --cached` for `docs/bundle-report.html` and ignore it so the user's local report remains. Do not remove actively referenced font subsets.
5. **Prune only stale manual chunk entries.** Remove the listed transitive-only packages from `manualChunks`, preserving packages that source files import directly. This maintains intentional chunking for direct imports without pinning entries that are not root dependencies.
6. **Validate in layers.** Run reference checks before deletion; after changes run TypeScript checks/build/tests, OpenSpec validation, capabilities checks, dependency/build-output checks, and Rust clippy/tests. If an individual deletion fails the reference audit, retain it and document the exception instead of forcing the inventory.
7. **Upgrade the local OpenSpec validator rather than adding a synthetic spec delta.** The pinned 1.6.0 CLI rejects zero-delta changes even when `.openspec.yaml` sets `skip_specs: true`, while a newer CLI recognizes the marker and accepts the pure refactor. Raise the project dependency to `^1.13.2` (lockfile resolves 1.14.3) so `npm run validate:openspec` uses the supported behavior. A fabricated delta was rejected because it would claim a behavior requirement that this change does not introduce.

## Risks / Trade-offs

- [A supposedly unused symbol has an indirect or dynamic consumer] → Recheck repository references and CodeGraph callers before deletion; retain any item with a live production use.
- [Manifest removal leaves stale lockfile or Tauri registration] → Update npm and Cargo metadata together and run dependency/build plus Rust checks.
- [Font or report removal affects packaging or local workflows] → Build after removal; only remove the two identified non-subset fonts, and preserve the bundle report locally while ignoring it.
- [The broad inventory makes regressions hard to localize] → Keep edits restricted to the enumerated items and use the issue's targeted validation commands.

## Migration Plan

No user data migration is required. Update manifests and lockfiles, remove the listed files/configuration, run all required checks, then archive the change after successful verification. Rollback is a normal revert of the PR; the bundle report remains available in the working tree locally, while deleted generated assets can be restored from version control if needed.
