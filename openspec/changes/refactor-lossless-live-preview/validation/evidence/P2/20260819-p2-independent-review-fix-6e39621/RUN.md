# Validation Run Record — P2 独立复核缺陷修复（冻结候选）

状态：COMPLETED（全部修复 + 全量 gate 通过，作为新的冻结 corrective evidence）

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P2（独立复核 corrective） |
| Run ID | `20260819-p2-independent-review-fix-6e39621` |
| Date/time | 2026-08-19 |
| Agent/operator | Claude Code（AI 修复 + 独立复核） |
| Branch | `test/issue-255-lossless-byte-contract` |
| Commit SHA | `6e39621`（冻结修复候选） |
| Dirty status | CLEAN（修复已提交） |
| Feature flags | `losslessCoreSession`（off 默认）、`codemirrorLivePreview`（off 默认） |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Artifact manifest | `./artifact-manifest.json`（本文件（RUN.md）与 manifest 自身在生成 manifest 后回写，终态见目录内容） |

## Scope

独立复核指出的缺陷（P1 ×5 + P2 ×2）全部在本候选修复：

1. **P1-1 marker 弱化范围覆盖整个 construct** — `src/lib/lossless/projection.ts`（ConstructRange 改离散 markers 数组，逐 delimiter 弱化，禁止首尾包络）+ `src/lib/lossless/projection.test.ts`（新增 strong/link/heading 三条）
2. **P1-2 lossless 桌面门禁包含 acceptance spec** — `e2e/wdio.conf.mjs`（lossless suite 只指向 `all-lossless.e2e.mjs`，acceptance 独立 suite）
3. **P1-3 projection failure E2E 未注入真实 failure** — `src/lib/lossless/projection.ts`（test-only 注入钩子）+ `e2e/specs/lossless/live-preview.e2e.mjs` + `e2e/specs/lossless/p2-acceptance.e2e.mjs`（注入真 throw 并断言降级+编辑+保存）
4. **P1-4 Live Preview 工具栏操作隐藏 ProseMirror** — `src/lib/lossless/commandRouter.ts`（新增统一命令路由）+ `src/components/toolbar.ts` + `src/components/linkDialog.ts` + `src/utils/keyboard.ts`（命令经活动 CM 视图 dispatch）
5. **P1-5 P2 evidence 不满足封存合同** — 本 run 即为新建的冻结 corrective evidence（记录确切 commit、完整命令输出、fixture hashes、manifest）
6. **P2 projection 状态机** — `src/lib/lossless/projection.ts`（补 composing/disposed 状态、重建后不再永久 stale、destroy 重置为 source、binding close 置 disposed）+ 模式指示同步

## Commands

| ID | Command | Exit | Status | Output path |
| --- | --- | --- | --- | --- |
| C01 | `npx tsc --noEmit` | 0 | PASS | `logs/C01-tsc.log` |
| C02 | `npx vitest run`（全量） | 0 | PASS（36 files / 438 tests） | `logs/C02-vitest.log` |
| C03 | `cargo test --manifest-path markflow-core/Cargo.toml` | 0 | PASS（93 tests） | `logs/C03-core.log` |
| C04 | `cargo test --manifest-path src-tauri/Cargo.toml` | 0 | PASS（151 tests） | `logs/C04-tauri.log` |
| C05 | `npm run build` | 0 | PASS | `logs/C05-build.log` |
| C06 | `npm run test:byte-contract` | 0 | PASS | `logs/C06-byte-contract.log` |
| C07 | `npx openspec validate --all` | 0 | PASS（61 passed） | `logs/C07-openspec-all.log` |

## Fixture hash 清单

24 个 canonical byte fixtures 的 SHA-256 记录于 `fixture-hashes.txt`（tests/fixtures/byte-contract/fixtures/ 下的全部 .md 与二进制 fixture）。

## 独立复核对账

- 冻结候选 `6e39621` 相对此前的冻结候选 `54ee16a`：产品代码修复全部合入（projection、toolbar、commandRouter、键盘、链接、E2E、evidence）。
- 全部门禁在冻结候选上通过；桌面对应 E2E suite 的 fixture 分离已由 `e2e/wdio.conf.mjs` 的 suite glob 解析验证过（lossless 与 lossless-acceptance 两个 suite 不重叠）。

## 结论

P2 独立复核指出的全部缺陷已修复并固化于冻结候选 `6e39621`。本 evidence 为新的冻结 corrective run，不回写任何历史 run。