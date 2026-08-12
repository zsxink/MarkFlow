# P0 独立复核报告 — 现状基线与 Byte 合同

Run ID：`20260812-192707-p0-baseline`
Reviewer：独立复核 agent（fresh context，不信任实现 agent 摘要）
复核日期：2026-08-12
Review 对象：P0（baseline + byte contract），Issue #254 / child #255

## 1. Identity

| 字段 | 值 | 复核结果 |
| --- | --- | --- |
| Branch | `test/issue-255-lossless-byte-contract` | 与预期一致 |
| HEAD | `aba52cc` | 与预期一致（evidence 提交后） |
| 工作树（复核开始时） | clean（`git status --porcelain` 空，exit 0） | 无未提交改动 |

复核中段工作树发生变化（**非本复核导致**）：`openspec/changes/p0-lossless-byte-contract/tasks.md` 被改为 7.1–7.3 勾选（mtime 19:32:42），并新增 `docs/manual-acceptance-checklist.md`（mtime 19:32:33）。两者 mtime 早于本复核的 characterization（19:33:50）与 npm test（19:35:42）运行；本复核所跑命令（test:byte-contract / characterization / cargo / tsc / npm test）对 openspec 文档均为只读，未产生上述改动。内容为 P0 流程自身的任务勾选与人工验收 handoff 文档，不属产品代码或测试文件，不影响本复核结论。

HEAD 提交链：`aba52cc`（记录 P0 AI gate 证据）→ `d6f289e`（冻结 ADR/矩阵）→ `aca694d`（dispatcher harness 骨架）→ `0df5263`（fixtures/L0/L1/characterization）→ `3db9382`（基线）。

注：`validation/phases/P0.md` 与 `RUN.md` 记录的 candidate commit 为 `d6f289e`（evidence 提交前），evidence 提交后为 `aba52cc`，符合「证据单独提交」流程，不构成问题。

## 2. 静态审查结论

### 2.1 L1 harness — `tests/byte-contract/l1-harness.mjs`

- **原始字节比较**：`pass = output.equals(oracle.out)`（l1-harness.mjs:75），prefix/suffix 用 `Buffer.subarray` + `.equals` 逐字节比较（:68-73）；全程无 trim/normalize 字符串比较。✓
- **Negative controls 损坏未触及 byte 且必须失败**：selfCheck 对 from>0 取 `target = floor(from/2)`（位于 surviving prefix 内），from==0 取 oracle 末字节（位于 surviving suffix 内），`corrupted[target] ^= 0xff` 后必须 `pass=false`（:146-153）。✓
- 跳过 2 个 negative（oracle 仅 1 字节，无 surviving byte 可损坏）：`empty-add-trailing-boundary`、`newlines-only-delete-last-trailing-boundary` — 保守跳过，合理。✓
- **尾部边界按 line-break boundary 计数**：`trailingRun()` 匹配 `(?:\r\n|\r|\n)+$`（:45-48）；`generate-fixtures.mjs:86-104 trailingBoundaries()` 对 `\r\n` 计 1、`\r\n\r\n` 计 2。fixtures README 明确声明「boundary count 数 line-break boundaries，NOT visual blank lines」（tests/fixtures/byte-contract/README.md:11-12）。✓

### 2.2 L0 harness — `tests/byte-contract/l0-harness.mjs`

- `pass = input.equals(output)` + SHA-256 + length + byteDiffCount（:35-47）；negative 翻转一字节必须失败（:60-67）。✓

### 2.3 fixtures 生成器 — `tests/byte-contract/generate-fixtures.mjs`

- 确定性合成（固定内容、固定编码、大文件用 seeded PRNG，:30-38）；manifest 记录 byteLength/sha256/bom/eol/trailing/encoding（:230-239）。✓
- `manifest.json` 的 sha256 与磁盘实际字节一致（抽验 utf8-crlf-tail2 / utf8-mixed-tail2 / utf8-bom-lf-tail2 全部 match）。✓
- `utf8-crlf-tail2.md` 实际尾部 `0d0a0d0a` = `\r\n\r\n` = 2 个 line-break boundary，manifest `trailing: 2` 一致。✓
- `l1-intents.json`：95 条 intent；`utf8-crlf-tail2` 的 5 条 intent 字节偏移正确（`# Title\r\n\r\n` = 11 字节起为 Body；delete-last-trailing-boundary from=69,to=71）。✓

### 2.4 PM characterization — `tests/byte-contract/pm-tail-newline.characterization.test.ts`

- **位于默认 vitest include 之外**：`vitest.config.ts:6` include 仅 `src/**/*.test.ts`；该文件在 `tests/byte-contract/`。实际 `npm test` 只运行 31 个 src 文件 / 339 tests，characterization 未进入默认 suite。✓
- 独立配置 `vitest.characterization.config.ts`（happy-dom，include `tests/byte-contract/*.test.ts`），仅由 `npm run test:characterization` 触发。✓
- **驱动真实编辑器栈**：真实 Tiptap `Editor` + `StarterKit` + `tiptap-markdown` `Markdown` extension，注入真实 `setMarkdown`/`getMarkdown`（`src/lib/editor.ts`），无 `vi.mock`。已用 codegraph 核对真实函数体。✓
- 失败 fixture（utf8-crlf-tail2/3、utf8-cr-tail1）断言 `verdict.pass === false`、`trailingPreserved === false`、`savedTail !== oracleTail`（:87-92）。✓
- `utf8-lf-tail3` 测试断言用户显式删尾后被陈旧元数据补回 3 个 LF（:112-116）。✓

### 2.5 ADR — `openspec/changes/p0-lossless-byte-contract/docs/adr.md`

- ADR-001 坐标类型（Utf16Offset / LogicalUtf8ByteOffset / SourceByteOffset / Revision/Affinity/SourceRange）与 umbrella `01-byte-fidelity-and-position.md` §4 一致。✓
- ADR-002 EOL inheritance 顺序（同序号被替换 boundary → 右邻 surviving → 左邻 surviving → 文档主导 EOL → 新文档默认 EOL）与 `01-byte-fidelity-and-position.md` §3 规则 4 逐字一致。✓
- ADR-003 按操作 identity matrix（text patch/ack、Render IR、save、resource）与 `02-core-session-and-sync.md` §2 完全一致。✓
- ADR-004 guarded-write/CAS 与 child design.md 摘要一致；平台表（macOS AVAILABLE 待 P1B / Windows/Linux BLOCKED）。✓
- ADR-005/006（无效 UTF-8、Save As 格式策略）与设计约束一致。✓

### 2.6 dispatcher contract — `src-tauri/src/dispatcher_contract.rs`

- **真实 Tauri dispatcher**：`tauri::test::mock_builder().manage(state).build(mock_context(noop_assets))` 构建真实 App（MockRuntime），`app.state::<AppState>()` 取真实 State，直接调用真实 `crate::commands::files::read_file`/`write_file`，操作真实 filesystem（temp_dir）。不是 mock invoke。✓
- 4 个测试：CRLF+CJK round-trip、UTF-8 BOM round-trip、缺失文件 Err、>100MB（sparse）Err。✓
- `src-tauri/Cargo.toml` 增加 dev-deps `sha2` + `tauri`（features `protocol-asset`,`test`）；`src-tauri/src/lib.rs:10-11` `#[cfg(test)] mod dispatcher_contract;`。✓

## 3. 独立重跑命令（记录退出码）

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run test:byte-contract` | 0 | fixtures --verify 稳定；L0 24/24 正例 + 23/23 负例；L1 95/95 正例 + 93/93 负例 |
| `npm run test:characterization` | 0 | 4/4 捕获基线 L1 违约（该 suite「通过」= 断言了违约，见 §4） |
| `cargo test --manifest-path src-tauri/Cargo.toml dispatcher_contract -- --nocapture` | 0 | 4 passed；write/read payload sha256 一致（`8875a025...`） |
| `npx tsc --noEmit` | 0 | 0 errors |
| `npm test`（对照） | 0 | 339 passed；characterization 未进入默认 suite（证明其隔离） |

与实现 agent RUN.md 中 C05/C06/C07/C02 记录完全一致。

## 4. 独立 negative control（自建，非 harness 自检）

- 输入：`tests/fixtures/byte-contract/fixtures/utf8-crlf-tail2.md`（73 字节，尾部 `\r\n\r\n`）。
- intent：`{"from":0,"to":0,"inserted":"Z"}`。oracle = `Z` + 全输入（74 字节，尾部 `0d0a0d0a`）。
- 损坏 surviving 区内 1 字节：oracle 偏移 70（= 输入偏移 69，尾部第一个 `\r`，0x0d → 0xf2）。
- 运行 `node tests/byte-contract/l1-harness.mjs input.md corrupted.md intent.json`：
  - 结果：`pass: false`，退出码 1，`suffixOk: false`，`trailingPreserved: false`，`firstDiffAt: 70`（恰为损坏字节）。✓
- 对照正例（未损坏 oracle）：`pass: true`，退出码 0，`trailingPreserved: true`。✓

## 5. PM characterization 判定

**诚实、非 mock。** 测试驱动真实 Tiptap + tiptap-markdown + 真实 `src/lib/editor.ts` 的 `setMarkdown`/`getMarkdown`，对比保存路径字节与 L1 oracle。实测字节级尾部差异：
- `utf8-crlf-tail2`：oracleTail `\r\n\r\n` → savedTail `\n`（CRLF→LF，边界数 2→1）
- `utf8-crlf-tail3`：oracleTail `\r\n\r\n\r\n` → savedTail `\n`（3→1）
- `utf8-cr-tail1`：oracleTail `\r` → savedTail `''`（CR 完全丢失）
- `utf8-lf-tail3` 显式删尾：陈旧元数据补回 3 个 LF

该 suite 的「通过」是断言基线违反 L1（`expect(verdict.pass).toBe(false)`），属预期失败证明，且已被隔离在默认绿色 suite 之外，不会成为常驻红测。

## 6. ADR 一致性判定

EOL inheritance 顺序与按操作 identity matrix 与 umbrella design 文档逐字一致；坐标类型与 guarded-write 与设计摘要一致。ADR 状态 FROZEN，Reviewer 签字位保持 PENDING（本报告为独立复核记录）。

## 7. 最终结论

**PASS** — P0 AI gate 全部复核项通过。

- 身份、静态审查、独立重跑（4 条命令 + 对照 npm test）全部符合。
- 自建 negative control 证明 L1 harness 能拒绝 surviving 区内单字节损坏（firstDiffAt 精确命中）。
- PM characterization 真实复现尾换行字节丢失；ADR 与 umbrella 设计一致。
- 全部产物为测试/fixtures/文档，未改产品 runtime；复核过程未修改任何产品代码或测试文件，仅写本报告。

### 记录的非阻塞观察（不构成 FAIL）
1. dispatcher round-trip 断言用 String 相等而非 Buffer 相等（dispatcher_contract.rs:70）——dispatcher 命令合同本身是 String 型，且 payload sha256 相等已覆盖字节层面，可接受。
2. L1 `verifyL1` 中 `trailingPreserved` 在 intent 触及尾部时为 `null`（信息字段），但 `pass` 始终是原始字节相等，无绕过风险。
3. Windows/Linux guarded-write 原语 BLOCKED（无设备登记），已在 RUN.md/P0.md 如实记录。
