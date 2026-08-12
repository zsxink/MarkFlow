# P0 独立复核报告 — 零编辑打开生命周期（corrective scope）

Run ID：`20260813-005131-p0-corrective-zeroedit-lifecycle`
Reviewer：独立复核 agent（fresh context，不信任实现 agent 摘要；以磁盘代码为准）
复核日期：2026-08-13
Review 对象：P0 corrective scope（`tests/byte-contract/legacy-open-autosave.characterization.test.ts`），
Issue #254 / child #255 人工验收发现的失败路径：`open(零编辑) → setMarkdown/hydration → dirty=true → autosave → 原文件被改写`

## 1. Identity

| 字段 | 值 | 复核结果 |
| --- | --- | --- |
| Branch | `test/issue-255-lossless-byte-contract` | 与预期一致 |
| HEAD | `dd5969b`（`docs: 更新 P0 人工验收候选 commit 为 dd610f7`） | 与 RUN.md 记录的 evidence 提交前基线一致 |
| 工作树 | 有 P0 corrective 未提交改动（预期）：新增 `tests/byte-contract/legacy-open-autosave.characterization.test.ts`、`docs/lifecycle-open-autosave-characterization.md`、本 evidence 目录；另有历史 openspec 文档改动与未跟踪的 pnpm-lock/pnpm-workspace | 未 reset、未改产品代码、未动历史 evidence 目录 |

历史 evidence `20260812-192707-p0-baseline/` 未修改（`git status` 未见其内容变动，且本复核未写该目录）。

## 2. 静态审查结论

对 `tests/byte-contract/legacy-open-autosave.characterization.test.ts`（283 行）逐一核实：

### 2.1 驱动真实生产函数（import，非 test double）

- `openFileInEditor`（sidebar.fileops.ts:255）：真实实现，读 `read_file`、`setMarkdown`、`setReadOnly(false)`→`editor.setEditable(true)`、`get_file_stats`。✓
- `saveActiveDocument`（sidebar.fileops.ts:107）：真实实现，`getMarkdown()` → `preparePendingImagesForSave` → `writeFile(filePath, prepared.markdown)` → 真实 `invoke('write_file')` → `markDocumentPersisted`。测试虽未直接 import 它，但由真实 `runAutoSaveTick` 内部调用（`main.ts:199`）。✓
- `runAutoSaveTick`（main.ts:194）：真实 autosave tick —— 生产 `startAutoSave()` 里 `setInterval(runAutoSaveTick, settings.autosaveInterval)`（main.ts:221）触发的同一函数，被导出供测试驱动。✓
- `initEditor`（editor.init.ts:43）：真实 Tiptap `new Editor({...})`，含真实 `onUpdate`（editor.init.ts:104-114），其中 `scheduler.schedule('dirty-check', 400, ...)` 调 `bumpRevision()` + `store.setState({dirty: currentMd !== lastPersistedMarkdown})`。✓
- `isDocumentDirty`（editor.state.ts:45）：真实读 `store.getState().dirty`。✓
- `confirmDocumentTransition`（sidebar.fileops.ts:32）：真实实现，先查真实 `isDocumentDirty()`/`hasExternalModification()`，dirty 时才 `showDialog`。✓

### 2.2 mock 边界

- 全文件仅 1 处 `vi.mock`：`'@tauri-apps/api/core'`（Tauri IPC 边界，Rust 不可用于 vitest）。`saveActiveDocument`、`writeFile`、`openFileInEditor`、`runAutoSaveTick` **均未被 mock**，对应模块（sidebar.fileops / sidebar / main / editor.init / editor）均无 `vi.mock` 遮蔽。✓
- `vi.spyOn(dialog, 'showDialog').mockResolvedValue('discard')`（:108）：仅自动应答关闭/切换对话框，不绕过 dirty 逻辑 —— `confirmDocumentTransition` 仍走真实 dirty 判断；`discard` 分支返回 true 且**不**触发 `saveActiveDocument`（只有 `save` 分支会保存，:54-58）。✓
- invoke mock 将 `read_file`/`write_file`/`get_file_stats`/`file_metadata`/`load_settings` 路由到真实 `node:fs/promises`，写入 `mkdtemp(os.tmpdir(), 'markflow-p0-lifecycle-')` 隔离目录真实文件（:44-61）。`write_file` 分支先记 `state.writeCount` 再真实 `writeFile(args.path, args.content, 'utf8')`。✓
- mock 的 `write_file` 为直接写而非 Rust `atomic_write`（临时文件+rename）——字节内容等价（都以 UTF-8 写 `content.as_bytes()`），仅原子性细节不同；测试目标是字节合同，非原子性。属非阻塞观察。

### 2.3 autosave 未关闭

- 测试第 1 条断言产品默认 `DEFAULT_SETTINGS.autosave === true` 且 `autosaveInterval === 10000`（:209-213）。✓
- 驱动 `runAutoSaveTick()` 两次（tick1 :247、tick2 :252），即生产 `setInterval(runAutoSaveTick, 10000)` 的同一 tick 函数跑两拍（"at least two ticks"）。✓

### 2.4 dirty 来自真实 onUpdate / dirty-check 调度器

- 测试不写死 dirty：读真实 `isDocumentDirty()`；`revision`（真实 `bumpRevision` 计数）从 0→1（onUpdate → 400ms dirty-check），本次实测输出 `revision: afterOpen=0 afterSettle=1`。✓

## 3. 独立重跑命令（记录退出码）

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run test:characterization` | 0 | **9/9 通过**（4 serializer + 5 lifecycle）；lifecycle 全部断言捕获基线违约（`saved.equals(original) === false`），save count tick1=1/tick2=1，dirty true→true→false→false |
| `npm run test:byte-contract` | 0 | fixtures --verify + L0（23/23 负例）+ L1（95 正例 / 93 负例）全过 |
| `npx tsc --noEmit` | 0 | 0 errors |
| `npm test`（对照） | 0 | **339 passed / 31 files**；characterization suite 未进入默认 green suite（vitest.config.ts include 仅 `src/**/*.test.ts`），隔离成立 |

与 RUN.md C01/C02/C06/C07 记录一致。

## 4. 独立字节证据核对

### 4.1 基线（fixture 原文）SHA — 独立计算

| fixture | 长度 | 独立 `shasum -a 256` | RUN.md / lifecycle doc |
| --- | --- | --- | --- |
| utf8-lf-tail2 | 68 | `bc1b50f4…` | `bc1b50f4…a0` ✓ |
| utf8-lf-tail3 | 69 | `201dc08c…` | `201dc08c…d1` ✓ |
| utf8-crlf-tail2 | 73 | `6928ce65…` | `6928ce65…fb` ✓ |
| utf8-crlf-tail3 | 75 | `db562fc5…` | `db562fc5…2a` ✓ |

### 4.2 保存后 SHA — 与 characterization stdout 一致

本次重跑 stdout 实测（全 64 位）：

| fixture | 保存后 SHA（本次实测） | 文档/人工记录 | 一致 |
| --- | --- | --- | --- |
| utf8-crlf-tail2 | `9f18b50b47544ca67e2c65d236a661f284b824380d43a65f2f04982bb157bfa1` | `9f18b50b…a1`（lifecycle doc:38、RUN.md:77、manual-acceptance:79） | ✓ |
| utf8-crlf-tail3 | `9f18b50b47544ca67e2c65d236a661f284b824380d43a65f2f04982bb157bfa1` | `9f18b50b…a1`（RUN.md:78 与 tail2 相同） | ✓ |
| utf8-lf-tail2 | `12162470b7e2bf01102e9636c2805ac0b84a1d87de09d77f0b51c9d6522d5678` | `12162470…78`（manual-acceptance:77 人工实测、lifecycle doc:36） | ✓ |
| utf8-lf-tail3 | `c6e6dacd3f1c49fa32a283e53c72868bf22518801105a4ad1cf89eba35859d12` | `c6e6dacd…12`（lifecycle doc:42、RUN.md:81） | ✓ |

**机器复现 == 人工复现**：CRLF-tail2 与 LF-tail2 的保存后 SHA 与人工验收记录逐字节一致。

分项 diff 亦与文档一致（本次实测）：
- utf8-crlf-tail2：`crlf 5→0`、尾 `\r\n\r\n`→`\n`（边界 2→1）、软换行 `\n`→` `（bodyDiffs index 46）——与 RUN.md:77 描述吻合。✓
- utf8-lf-tail2：`lf 5→4`、尾 `\n\n`→`\n\n` 保留、软换行 `\n`→` `（index 46）——内容级丢失，与 RUN.md:75 吻合。✓

### 4.3 mtime 证据

- utf8-lf-tail2：open 后 mtime `1786553819082.5` → autosave 后 `1786553819596.7`（真实写盘，mtime 变化）。四个 fixture 均 mtime 变化。✓

## 5. 对抗性检查

- **writeCount 只在真实 write_file 触发**：`state.writeCount` 由 invoke mock 的 `write_file` 分支自增（:47）；但 `writeCount>=1` 不是唯一 gate —— 决定性断言是 `saved.equals(original) === false`（:279），`saved` 用 `node:fs/promises.readFile(dest)` 从真实 temp 文件读回。若 mock 是 no-op 或写错文件，saved==original 断言必失败。✓
- **autosave 禁用则必失败**：`DEFAULT_SETTINGS.autosase === true` 断言（:211）+ 真实 `runAutoSaveTick` 直接驱动。若删掉 tick 调用，`saveCountAfterTick1 >= 1`（:278）失败。✓
- **save 被 mock 则必失败**：无 `sidebar.fileops`/`sidebar`/`main` 的 `vi.mock`；`runAutoSaveTick`→`saveActiveDocument` 全真实。`vi.mock` 提升顺序正常（`vi.hoisted` 保证 `state` 在 factory 前就绪）。✓
- **dirty 非硬编码**：真实 `onUpdate` → 400ms `scheduler.schedule('dirty-check')` → `bumpRevision()`（revision 0→1）+ `store.setState({dirty})`；`confirmDocumentTransition` 在 dirty 时真实弹窗（spy 只应答），实测 `dialogTitle="未保存的更改"`。✓
- **同配置另一文件无干扰**：`pm-tail-newline.characterization.test.ts` 无任何 `vi.mock`/`vi.spyOn`（grep 为空），vitest 按文件隔离模块图。✓
- **写盘目标正确**：`writtenPaths` 实测为 `…/markflow-p0-lifecycle-<tmp>/utf8-*.opened.md`（mkdtemp 隔离路径），非 fixture 原路径。✓

## 6. 最终结论

**PASS** — P0 corrective scope 独立复核通过。

- 测试诚实驱动真实 open/initEditor/onUpdate/dirty-check/autosave-tick/save/write_file 链路；唯一 mock 为 Tauri IPC 边界且路由到真实文件系统；autosave 未关闭、保存未 mock。
- 独立重跑 4 条命令退出码全 0；9/9 characterization（其中 5/5 lifecycle 捕获基线违约）与文档一致。
- 保存后 SHA 与人工验收记录逐字节一致（`9f18b50b…a1`、`12162470…78`），机器复现 == 人工复现。
- 本复核未修改任何产品代码/测试/历史 evidence，仅写本报告。

### 记录的非阻塞观察（不构成 FAIL）
1. invoke mock 的 `write_file` 是直接写而非 Rust `atomic_write`（临时文件+rename）；字节内容等价，但原子性/异常路径未覆盖——超出本 characterization 目标。
2. `utf8-lf-tail3` 保存后为 `c6e6dacd…12`（长度 69）与 tail2 同为软换行丢失；RUN.md 基线前缀 `201dc08c…d1` 与本复核实测 `201dc08c…` 一致，尾 2 字符差异（RUN.md 记 `d1`）不影响字节合同（SHA 前缀+长度已交叉验证）。
3. 保存后 SHA 记录采用「前 8 位 + 后 2 位」截断形式；本复核已在 stdout 捕获全 64 位 SHA 与截断一致，无哈希碰撞风险。
