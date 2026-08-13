# P0S 独立 Gate Review — NO-GO

## Candidate

- Run: `20260813-170525-independent-review-d74a79d`
- Commit: `d74a79d4ce0205f97fc94080966dc9a3af62ddf8`
- Branch: `test/issue-255-lossless-byte-contract`
- Scope: P0S 是否可放行 P1A；本次未修改产品代码。

## Verdict

**NO-GO → P1A**。产品代码的 P0S 安全修复与本轮自动化均通过，未发现新的 P0
行为缺陷；但最终证据链不符合本 change 的不可变审计协议，不能作为 P1A 的阶段放行依据。
先完成下列证据治理纠偏，再申请新的独立 gate review。

## 已复核的产品行为（PASS）

1. `saveActiveDocument` 在进入任何 `await` 前占用 `savingInProgress`，并以 `finally`
   释放；重复保存不会穿过 await gap。
2. 保存启动时捕获 document generation；A 的异步保存完成后，只有 generation 仍匹配时
   才能写 file stats、persisted state 或回灌 prepared Markdown，切换到 B 不会被 A 污染。
3. 立即输入后的 revision/dirty 在 ProseMirror transaction 同步更新，不依赖 400ms
   debounce；立即 Save、A→B、close 的 gate 读取同步真相。

本次从干净工作树重跑，结果均为 exit 0：

| Command | Result |
| --- | --- |
| `npx vitest run src/components/sidebar.fileops.test.ts src/lib/editor.state.test.ts src/main.autosave.test.ts src/main.lifecycle.guard.test.ts` | 4 files / 74 tests PASS |
| `npm run test:characterization && npm run test:byte-contract` | 9/9；L0 24/24 + 23/23，L1 95/95 + 93/93 PASS |
| `npx tsc --noEmit && cargo test --manifest-path src-tauri/Cargo.toml` | TypeScript PASS；Rust 126 PASS |
| `npx openspec validate refactor-lossless-live-preview --strict && npx openspec validate --all && bash scripts/check-archive-synced.sh && git diff --check` | PASS |
| `npm run test:e2e:p0s` | real WebKit，4/4 PASS（autosave=true, 2000ms） |
| `npm test` | 32 files / 375 tests PASS |

人工记录 `manual-acceptance-p0s-checklist.md` 的 Section 6/7 已包含 xian 对立即
Cmd+S、立即 A→B 与立即关闭的通过记录；本次 Reviewer 不代替人工验收。

## P1 阻断：最终证据不是新的、不可变的封存 run

`validation/VALIDATION-PROTOCOL.md` 第 2、6、9 节要求：修复后使用**新 run-id**，每个
run 保存本地不可变环境与 hash，历史 RUN/ENVIRONMENT/REVIEW 不得改写。当前标为最终证据
的 `20260813-100918-p0s-immediate-transaction-guard` 不满足这些条件：

1. 其 `RUN.md` 顶部仍是 **NO-GO**，candidate 仍为 `9884790`，不是本次候选
   `d74a79d`；同一目录后来追加了 PASS addendum，混合了失败和修复后的结论。
2. 该目录的 `artifact-manifest.sha256` 经 `shasum -a 256 -c` 校验有 **13 项不匹配**，
   包括 RUN/REVIEW、P0S phase、tasks、issues 与实现文件。因此它不能证明任何固定候选。
3. ISSUE-001/002/003 的标题虽改为 FIXED，正文仍是 `Fix: NOT IMPLEMENTED`、
   `Verification: NOT STARTED`、`Closure: NOT RECORDED`，没有可审查的关闭链路。
4. `validation/phases/P0S.md` 和 `validation/README.md` 声称 P0S GO，但 README 的
   P1A 行仍写 `BLOCKED by P0S`；权威状态相互矛盾。

上述为 release/validation evidence blocker，已登记为 ISSUE-004；它不否定本次代码的
功能性 PASS，也不得通过修改旧 run 来“补齐”。

## 非阻断观察（P2）

- P0S desktop suite 的「zero-edit → two autosave ticks → close」测试没有实际执行窗口
  close，也没有在该自动化用例中记录 mtime/save count；人工 E3 有相应记录。下一次最终
  run 建议补强该 E2E，或清楚地把该两项限定为人工证据。
- E2E 用 UTF-8 字符串读取比较而非 Buffer/hash 比较；当前 fixtures 可覆盖 BOM/EOL 的
  可见差异，但 byte contract 更适合以 `Buffer`/SHA-256 作为断言。
- `saveActiveDocumentAsNewFile` 仍没有 document-generation completion guard。它不属于
  P0S autosave/active-save 的本次放行范围，但在 P1 的 save lifecycle 工作开始前应登记并
  处理，避免另存为路径重新引入跨文档状态污染。

## Required remediation before a new review

1. 保留 `20260813-100918-...` 原样作为历史 corrective/NO-GO 证据；不要重算或覆盖其
   manifest。
2. 以最终候选 `d74a79d`（或后续明确的新候选）创建全新的 P0S final run：独立
   `RUN.md`、本地 `ENVIRONMENT.md`、命令输出、fixture/hash、manifest 与 reviewer report。
3. 逐项补全 ISSUE-001/002/003 的 Fix、Verification、Closure，并链接新的 final run；
   将 ISSUE-004 关闭前不得恢复 P0S GO。
4. 只在上述 run 的 manifest 校验成功后，同步更新 phase、validation index、tasks 的
   P0S/P1A 状态；再由 Program Owner 依据同一 candidate 的人工记录决定 GO。

## Conclusion

本轮给出的结论是：**实现可继续作为候选，但 P0S 尚未通过可审计的最终验收，P1A 不能
启动。**
