# Design

## Context

See `proposal.md` — Why.

Current constraints found in the repo:

- `src/lib/field-scan.test.ts` treats a fixed list of repository documents as its scan corpus. `docs/cleanup-plan/code-standards.md` is one corpus entry, so moving or deleting that file breaks the field-scan gate unless the constant is updated in the same change.
- `docs/bundle-baseline.md` is a snapshot, not an executable gate. The executable gate is `scripts/check-bundle-size.sh` / `npm run check-size`, and the behavior contract lives in `openspec/specs/bundle-budget/spec.md`.
- `docs/bundle-report.html` is already untracked and gitignored; `npm run analyze` regenerates it into `docs/`.
- `docs/` has no `archive/` directory yet, so this change establishes the convention.
- Archived OpenSpec changes under `openspec/changes/archive/` reference `docs/cleanup-plan/` by name. They are immutable historical records and must not be rewritten.
- `evidence/field-scan-summary.json` is a one-off artifact recording a past scan; it is not a live reference source.

## Goals / Non-Goals

**Goals:**

- Make every remaining statement in `docs/bundle-baseline.md` unambiguously historical, with the command to regenerate and the pointer to the authoritative budget gate.
- Make `docs/cleanup-plan/` unambiguously closed out: each priority item shows landed / not-landed and where unfinished work went.
- Move the directory to `docs/archive/cleanup-plan/` so the live `docs/` tree contains no stale "plan to do" documents.
- Keep the field-scan corpus intact (same document count and content), by updating the path constant rather than dropping the entry.

**Non-Goals:**

- No new spec requirements, no behavior change, no code logic change.
- Not completing any unfinished cleanup items (splitting large files, dedup, layering work). Those are re-pointed to issues/roadmap, not implemented here.
- Not rewriting historical archives (`openspec/changes/archive/**`) or one-off evidence artifacts.
- Not regenerating `docs/bundle-report.html` as part of this change (it is a local, gitignored produced artifact).

## Decisions

1. **Archive to `docs/archive/cleanup-plan/` rather than keeping the directory in place.**
   Rationale: the issue lists archiving as the preferred option; a live `docs/cleanup-plan/` keeps inviting readers to treat a finished plan as pending work. The alternative (keep in place with a "已收口" banner) leaves the path semantics wrong.
   Cost: one test-constant update, which the same change performs.

2. **Annotate `priority.md` in place rather than rewriting it.**
   Each table row gets a status suffix (`已完成` with PR/issue link, `未完成 → 去向`, or `已并入 <issue>`). Keeping the original item text preserves the historical analysis; rewriting would lose the evidence trail. Per `code-standards.md` §7, the archive banner replaces per-file "status: draft" headers.

3. **`bundle-baseline.md` stays as a historical baseline, not a deleted file.**
   It still documents how the 2026-07-19 figure was derived and what the distribution looked like; deleting it loses the comparison point for PR #331. The header gains a `> 状态：历史基线（已过期）` banner naming the record date, the drift from current output, the regeneration command, and the authoritative gate.
   Alternative considered: delete the file and rely on `bundle-budget` spec only. Rejected — the spec defines budgets, not measured history.

4. **Point the historical/current comparison at measured facts, not invented ones.**
   The banner quotes the issue's measured current chunks (`mermaid.core` 687K, `cynefin` 675K, `vendor-prosemirror` 512K, `index` 463K — the KiB conversions of the one-time `npm run build` output) and the `chunkSizeWarningLimit: 720` in `vite.config.ts`, labeled as "current at the time of this note" — the file must not present them as maintained assertions.

5. **Update `src/lib/field-scan.test.ts` `DOCS` in the same commit as the move.**
   Otherwise the field-scan gate fails on a missing corpus file. Keeping the archived `code-standards.md` in the corpus preserves the deliberate coverage of "code standards rules that must not silently rot".

6. **Repository-wide reference sweep is verification, not edit.** Live references are fixed; archived OpenSpec changes and one-off evidence JSON are documented as intentional historical references with a note in `analysis.md`/README rather than being edited.

## Risks / Trade-offs

- [Broken relative links inside the moved directory] → Audit every relative link in the four cleanup-plan files; links between files in the same directory survive the move, links to `../` targets get adjusted, and the verification step greps for the old path.
- [Field-scan silently drops a document if the path is mistyped] → The test asserts `readFileSync(...).length > 0` with a "missing/empty corpus input" message; the verification runs `npm test`.
- [Archived OpenSpec history still naming `docs/cleanup-plan/`] → Accepted: archives are historical records; the change documents this decision so a future grep hit is not mistaken for a live broken link.
- [Readers still trusting the historical numbers] → Banner is placed before any table, states the record date and the regeneration command, and names the authoritative gate.

## Migration Plan

Single-shot documentation change on a branch; no runtime migration. Rollback is `git revert` — no state is persisted anywhere.
