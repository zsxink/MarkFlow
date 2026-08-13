# Validation Issue — P0S Final Evidence Integrity

状态：CLOSED（2026-08-13）

| 字段 | 值 |
| --- | --- |
| Issue ID | ISSUE-004 |
| Severity | Validation / Release Gate |
| Phase | P0S final gate |
| First run ID | `20260813-170525-independent-review-d74a79d` |
| Commit/flags | `d74a79d4ce0205f97fc94080966dc9a3af62ddf8` / legacy ProseMirror + autosave=true |
| Environment | `../evidence/P0S/20260813-170525-independent-review-d74a79d/ENVIRONMENT.md` |
| Owner | P0S implementation / validation owner |

## Expected

P0S 的最终 GO 必须指向一个修复后新建、候选 commit 明确、manifest 校验通过的独立 run；
历史失败证据必须保留，issue closure 与 validation index 必须一致。

## Actual

现有 final 指向的 corrective run 顶部仍为 NO-GO / `9884790`，后续 PASS addendum 混在同一
目录；其 manifest 有 13 项 checksum mismatch。ISSUE-001/002/003 的状态与正文 closure
不一致，phase 与 validation index 对 P0S/P1A 的状态也不一致。

## Evidence

- `../evidence/P0S/20260813-170525-independent-review-d74a79d/REVIEW.md`
- `../evidence/P0S/20260813-100918-p0s-immediate-transaction-guard/artifact-manifest.sha256`
- `../VALIDATION-PROTOCOL.md` §§2, 6, 9

## Required fix

创建新的 final P0S run 并封存其环境、输出与 manifest；补全 ISSUE-001/002/003 closure；
然后在同一候选与同一证据链下重新进行独立 Reviewer、人工验收与 Program Owner 决定。

## Closure criteria

- [x] 新 final run 的 RUN、ENVIRONMENT、输出和 manifest 均存在，且 manifest 校验为 0 mismatch。
      （final run `20260813-1715-p0s-final-d74a79d`：manifest 16 项全部 OK）
- [x] final run 的 candidate SHA 与 phase/README/tasks 一致。
      （candidate `d74a79d4ce0205f97fc94080966dc9a3af62ddf8`，见本目录 RUN.md Identity）
- [x] ISSUE-001/002/003 都有 fix commit、passing run、Reviewer 与 closed date。
      （已补全，均链接 final run）
- [x] 新的独立 Reviewer 给出 PASS，且 Program Owner 以同一候选人工验收记录批准 P0S GO。
      （final gate Reviewer PASS：`20260813-1715-p0s-final-d74a79d/REVIEW.md`；
      Program Owner xian 以候选 d74a79d 确认人工验收适用并批准 P0S GO，2026-08-13）

全部 closure criteria 达成，**ISSUE-004 关闭**。
