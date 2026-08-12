# 零编辑打开生命周期 characterization（P0 corrective，tasks 4.4–4.6）

> 复现命令：`npm run test:characterization`
> 基线：`feat-v0.1.0@6bfba453`（P0 未改任何产品 runtime）
> 测试文件：`tests/byte-contract/legacy-open-autosave.characterization.test.ts`
> 运行环境：见 child change 的 corrective evidence run。

## 结论

人工验收发现的“零编辑失败路径”已被机器捕获，且**保存后字节与人工实测完全一致
（SHA-256 相同）**：

```
打开文件（零编辑）
→ setMarkdown/hydration + setReadOnly(false) 的 setEditable() update
→ dirty=true（dirty-check 调度器确认）
→ autosave tick（产品默认开启，autosave=true，interval 10000ms）
→ saveActiveDocument → write_file 把 serializer 输出写回原文件
→ 原文件字节被改写
```

lifecycle characterization 驱动**真实** legacy 生命周期：
真实 `openFileInEditor`、真实 Tiptap `initEditor`（含真实 `onUpdate` 与 400ms
dirty-check 调度器）、真实 `setReadOnly(false)` → `setEditable(true)` 的 update 事件、
真实 autosave coordinator `runAutoSaveTick`（即生产 `startAutoSave()` 里
`setInterval(runAutoSaveTick, autosaveInterval)` 触发的同一 tick）、真实
`saveActiveDocument`，写盘走真实 `write_file` 到隔离临时目录的真实文件系统。
**唯一**被 mock 的边界是 Tauri `invoke` IPC（vitest 下没有 Rust）；该 mock 把
`read_file`/`write_file`/`get_file_stats`/`file_metadata` 全部路由到真实磁盘文件，
保存链路没有被 mock 掉，autosave 也没有被关闭。

## 实测证据（每个 fixture 打开后只等待真实 dirty-check，再驱动两个 autosave tick）

| fixture | 输入 length | 输入 SHA-256 | dirty(open→settle→tick1→tick2) | 关闭提示 | save count(tick1/tick2) | 保存后 SHA-256 | mtime 变化 | 失败类型 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `utf8-lf-tail2` | 68 | `bc1b50f4…a0` | true→true→false→false | “未保存的更改” | 1 / 1（tick2 跳过） | `12162470…78` | 是 | 正文软换行 `\n`→` `（内容级丢失） |
| `utf8-lf-tail3` | 69 | `201dc08c…d1` | true→true→false→false | “未保存的更改” | 1 / 1 | `c6e6dacd…12` | 是 | 同上 |
| `utf8-crlf-tail2` | 73 | `6928ce65…fb` | true→true→false→false | “未保存的更改” | 1 / 1 | `9f18b50b…a1` | 是 | CRLF→LF（5→0）、尾部 `\r\n\r\n`→`\n`（边界 2→1）+ 软换行 `\n`→` ` |
| `utf8-crlf-tail3` | 75 | `db562fc5…2a` | true→true→false→false | “未保存的更改” | 1 / 1 | `9f18b50b…a1`（与 tail2 相同） | 是 | CRLF→LF（6→0）、尾部 `\r\n\r\n\r\n`→`\n`（边界 3→1）+ 软换行 `\n`→` ` |

- **保存后 SHA 与人工验收一致**：人工记录 manual-tail2-lf `12162470…78`、
  manual-tail3-lf `c6e6dacd…12`、manual-tail2/3-crlf `9f18b50b…a1`（见
  `docs/manual-acceptance-checklist.md`），与上表逐个相同。机器复现 = 人工复现。
- **dirty 来源**：打开阶段 `markDocumentPersisted` 即发现 serializer 输出与
  persisted baseline 不等（软换行被序列化为空格），`dirty` 立即为 true；随后
  `setReadOnly(false)` 的 `setEditable(true)` 发出 update，400ms dirty-check
  调度器确认（`revision` 0→1）。
- **关闭提示**：`confirmDocumentTransition()` 在 dirty 时弹出“未保存的更改”对话框
  （`showDialog` 被记录，未阻塞在人工点击）。
- **两个 tick**：tick1 写盘（save count 1）；`markDocumentPersisted` 把写回内容
  记为 baseline 后 dirty=false，tick2 跳过（save count 仍 1）。与产品
  `setInterval(runAutoSaveTick, 10000)` 语义一致。

## 为什么既有测试不能替代本条 characterization（task 4.6）

| 既有证据 | 覆盖了什么 | 为什么不能替代 4.4 |
| --- | --- | --- |
| `pm-tail-newline.characterization.test.ts`（serializer 级） | 驱动真实 Tiptap + `setMarkdown`/`getMarkdown`，证明正文编辑后尾部/软换行字节违约 | **不驱动产品生命周期**：没有真实 `openFileInEditor`、没有 `setReadOnly(false)`/onUpdate、没有 autosave timer、没有 `saveActiveDocument`/`write_file`。它证明“编辑后保存会丢字节”，不能证明“零编辑打开也会写盘”。 |
| L0 oracle self-check（`l0-harness.mjs --self-check`） | 输入/输出 sha256/length/byte diff 全等判定的 oracle 正确性 | oracle 只比较两个**给定文件**，从不产生文件、不驱动 dirty/autosave。它只证明比较器可靠，不证明保存路径会产生什么样的文件。 |
| `autosave=false` E2E smoke（`npm run test:e2e`） | 打开→保存基础 UI 流 | **显式关闭 autosave**，与失败路径正相反；且 e2e 打开→保存不等待 autosave 写回原文件，无法观测“零编辑即 dirty + 定时写盘”。 |

因此零编辑生命周期只能用真实 open/dirty/autosave/write 链路来测；standalone
Editor、oracle 自比较、`autosave=false` smoke 均不构成该路径的证据。

## 测试边界与已知缺口（task 4.6）

- **边界 1 — IPC mock 是真实文件系统**：`invoke` 只模拟 Tauri IPC 的“命令名/参数
  契约”，`read_file`/`write_file`/`get_file_stats` 落在真实隔离临时目录；保存、
  读取、mtime 均为真实磁盘行为。这是 vitest（无 Rust）下能达到的最大真实度。
- **边界 2 — autosave 调度**：测试直接调用真实 `runAutoSaveTick`（生产 interval
  回调本身）两次，等价于等待两个真实 tick；未在 vitest 中跑 10s 级 `setInterval`。
- **边界 3 — 一个写盘周期**：本套件捕获“打开 → dirty → 第一次写盘 → 干净”的周期
  （save count 1）。人工观察到的“mtime 每 ~10s 变化（持续改写）”超出本单元级
  生命周期 harness：真实应用里文件 watcher 在 3s 抑制窗口后可能收到写盘事件并走
  external-modification/重载分支，从而在更长观察窗内产生第二轮 dirty。该交互属于
  watcher/重载边界，留待 P0S/后续 desktop 验证，不阻塞本 corrective 结论（“零编辑
  打开即写盘”已被一次周期证明）。
- **缺口 1 — 真实 Rust dispatcher**：vitest 无法运行 Rust；真实 dispatcher 的
  byte round-trip 已有 `src-tauri/src/dispatcher_contract.rs` 覆盖（历史 run）。
- **缺口 2 — 长窗口多周期写盘与 watcher 重载**：见边界 3。
- **缺口 3 — 修复后的绿色回归**：P0 只建立失败证据；“零编辑不写盘”的默认绿色
  回归必须在止血修复合入后另行建立（当前套件在修复后预期转红，是 characterization
  而非回归）。

## 复现机制说明

本套件**预期捕获基线违约**（`expect(saved.equals(original)).toBe(false)`），因此：
- 放在默认 vitest include（`src/**/*.test.ts`）之外，运行于独立 config
  `vitest.characterization.config.ts`，只通过 `npm run test:characterization` 执行；
- 不在 `npm test` 中成为长期红色测试；
- 断言的是“当前路径确实在零编辑时改写文件”，测试自身 pass（即违约被捕获），
  同时把 input/saved SHA、dirty 状态、save count、mtime 与分项 diff 写入 stdout
  供 corrective evidence 使用。
