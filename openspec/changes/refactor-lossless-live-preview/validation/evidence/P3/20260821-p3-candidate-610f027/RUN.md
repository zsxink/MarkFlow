# RUN.md — P3 frozen candidate for independent review

- Run ID: `20260821-p3-candidate-610f027`
- Date: 2026-08-21
- Candidate commit: `610f027421277db5c0960459e28eec5570414359`
- Branch: `test/issue-255-lossless-byte-contract`
- Purpose: freeze the P3 implementation candidate (tasks 5.1–5.9 done; 5.10 AI
  deliverables drafted) and hand it to an INDEPENDENT reviewer (fresh context,
  not part of the implementation) per task §六.

## Candidate scope

- `commandRouter.ts`: toggleCodeBlock now UNWRAPS an already-fenced selection.
- `imageSourceRange.ts` + `commandRouter` replaceImageSource/deleteImageSource:
  exact source-range image edits.
- `imageEditing.ts`: dblclick image edit panel bound on lossless open.
- `losslessSourceEditor.ts`: paste is intercepted → local transaction with
  `isolateHistory:'full'` (one paste = one Undo group); image-file paste/drop
  → resource pipeline → local insert with async-identity guard.
- `editorSurfaceBinding.ts`: onImageFiles resource pipeline wiring.
- `integration.ts`: binds image editing on open.
- Tests: `historyBoundary` (5), `commandMatrix` (20), `imageSourceRange` (12),
  `imagePaste` (4), `exportLossless` (6), `flagRollback` (4), expanded
  `commandRouter` (38), lifecycle 5.9 in-flight-write test (23).
- Full suite: 42 files / 516 tests PASS; tsc clean; byte-contract 93;
  core 93 / tauri 151 Rust; openspec 61.

## Review focus (task §六)

1. 默认保存消费者是否仍读取 PM/serializer（必须在 lossless 路径为 NO）
2. command 是否只修改局部 range（不全文重写、不碰隐藏 PM）
3. image/resource failure compensation 是否真实
4. CodeMirror 是否是唯一 History owner
5. default flag 与 rollback 是否安全
6. minimum parity 是否把 P4B 延后项误报为已完成

## Reviewer deliverables

- Static walkthrough (fresh context).
- Re-run: `npm test`, `npx tsc --noEmit`, and at least one Rust gate
  (`cargo test --manifest-path markflow-core/Cargo.toml --all-targets`).
- Verdict on each of the 6 review points, then a GO / NO-GO (or CONDITIONAL).
  Evidence to a `REVIEW.md` in this run dir.