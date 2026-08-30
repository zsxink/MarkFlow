# P4B-ITEM: code fence controls（task 7.4 widget pilot）

> P4B.md 要求「每个 construct 必须复制本记录为 `P4B-<construct>.md`」；本文件即为 code fence controls 项。
> 单项裁决 `P4B-ITEM-codeFenceControls-GO/NO-GO` 由主会话在 Reviewer + 人工验收 + Program Owner 齐备后记录，
> 执行流不自我批准。

## Identity

| 字段 | 值 |
| --- | --- |
| Construct | code fence（language badge + copy + language control） |
| Flag | `codeFenceControls`（`src/lib/lossless/cohortFlags.ts:175` `isCodeFenceControlsEnabled()`） |
| **Default** | **OFF** |
| Maturity | **pilot** —— 7.4 试点项，未申请默认开启 |
| Fallback | flag OFF 或 widget 失败 → `source-fallback`，fence 以源码呈现 |
| Run ID | `20260830-102354-p4b-ime-7869de8` |
| Commit | `7869de8` / `ec718b4` |
| Branch | `test/issue-255-lossless-byte-contract` |

## 历史修正（不可回写，仅前向记录）

`20260830-080554-p4b-widgets-a8c73de/FAILURES.md` 记录过一次 **fence boundary 失败**：
language control 在 `openMark.from` 处解析 Lezer，落在 `FencedCode` 之外的 token 边界上，
导致局部提交 fail-closed、测试检测不到源码变化。修正为在 `openMark.from + 1`
（严格位于 opening mark 内部）解析，并补了一条单元 DOM click + Undo 回归。
该 run 现已封存为 SUPERSEDED（gate 退出码未捕获，不作正式 gate run）。

## 证据

### 单元测试（C01，EXIT=0；16 files / 433 tests）

同 task checkbox 项；fence 特有的局部 patch 与 Undo 回归在
`src/lib/lossless/widgets/p4bWidgets.test.ts` 与 `commandMatrix.test.ts` 内。

### 桌面 E2E（C15，EXIT=0；28 passing，真实 Tauri WebKit）

直接命中本项：

- `fence controls flag OFF/ON show badge and copy; language is a local patch with Undo`
- `fence language control is absent in read-only and cannot change source`
- `fence controls keyboard-only activation is accessible and fail-safe`
- `⑤ fence: caret inside the code reveals the fence; no descent into body`

共享底座：failure injection / themes+zoom / dispose-recreate / export / Source↔Preview roundtrip
（见 `P4B-task-checkbox.md` 同表）。

### source-based clipboard（本项唯一有直接断言的地方）

`e2e/specs/lossless/p4b-widgets.e2e.mjs`：

- `:199` 点击 `.mf-widget-fence-copy` → 断言 `window.__p4bCopied === 'const x = 1;'`
- `:233` 键盘 Enter 激活同一按钮 → 同一断言

即：**fence 内容的 source 复制已有桌面断言，鼠标与键盘两条激活路径都覆盖。**

### 字节合同（C10，EXIT=0）

L0 `24/23`、L1 `95/93`、`"pass": true`、`"failed": []`。language patch 后
`saveRestoredSource` 校验磁盘字节逐字节还原。

## 已知缺口

1. **选区 copy 仍无证据**：上面两条断言只覆盖 **widget 的显式 copy 按钮**，
   不等于「用户选中 fence 后按 Cmd+C」走同一路径。后者无任何断言（详见 P4B.md 已知缺口 2）。
   本项是 P4B 中剪贴板覆盖**最完整**的一项，但同样未闭合选区路径。
2. **`mf-widget-fence-copy` 写的是 `navigator.clipboard.writeText`**，不是 `text/plain`
   clipboard 事件负载；P6「复制隐藏内容」场景要求的是后者。两者不可互相替代。

## 裁决

| 角色 | 结论 |
| --- | --- |
| AI 编码验证 | PASS（C01 / C15 / C10 全绿；剪贴板有 widget 按钮断言） |
| 独立 Reviewer | **PENDING** |
| 人工验收 | **PENDING** |
| `P4B-ITEM-codeFenceControls-GO/NO-GO` | **PENDING —— 不自我批准** |
