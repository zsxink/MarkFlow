# P2 Program Owner 人工验收记录（代理执行）

Run ID：`20260818-p2-program-owner-acceptance`
验收人：xian（Program Owner）— 由 Program Owner 代理（fresh context 子代理）执行桌面验收
日期：2026-08-18
候选：`fcba2f8`（冻结）/ `c5a820d`（evidence 归档）
Flags：lossless + codemirrorLivePreview（WebDriver 驱动）

## 执行方式

复用 e2e WebDriver 基础设施驱动真实 Tauri WebKit 桌面应用：
`e2e/run-lossless-acceptance.mjs`（staging + build + WDIO）与
`e2e/specs/lossless/p2-acceptance.e2e.mjs`（验收断言）。
通过 `window.__setLosslessCoreSession(true)` + `window.__setLivePreview(true)`
开启双 flag，经 `window.__markflowLossless` hooks 与 CM view 状态驱动。

## 验收结果总览

15 项验收断言全部 PASS（`npx wdio run e2e/wdio.conf.mjs --suite lossless-acceptance`）：
P2 9 项 + P1B 推迟补验 6 项（P1B-1/2 合并为一项）。

| 项 | 结果 | 说明 |
| --- | --- | --- |
| P2-1 语义渲染 | PASS | 9 类 construct 的 decoration 均存在；computed styles 证明强/斜/删/链/码/引/列/块可见；标题经 highlight 层（21px/700）区别于正文（15px/400）。截图见本目录 |
| P2-2 marker 可编辑 | PASS | 光标置于 `**加粗**` marker 内输入 X → 落在 marker 内（`**X加粗**`），不跳转 |
| P2-3 跨 construct 拖选复制 | PASS | 选中 heading→inline-code，selection 文本含 `# 标题一`、`**加粗**`、`行内代码`，execCommand copy 后 selection 完整 |
| P2-4 中文 IME 邻近 marker + Undo | PASS | CJK+emoji 输入 marker 邻域；Cmd+Z undo 恢复（`browser.keys` 驱动 CM historyKeymap）。**Redo 组合键 WebKit 无法注入，标记「依赖自动化证据 + Reviewer」** |
| P2-5 连续切模式 | PASS | 20 次切换 doc 不变、单 surface、scroll 保持 |
| P2-6 三主题/字号/窄窗口 | PASS | light/dark/sepia 循环渲染正常；字号 22px；sidebar 折叠 + 窗口缩至 800×600 无布局破坏 |
| P2-7 projection failure 回退 | PASS | `<<<><>` 输入后非空白，Save 后磁盘含该字符 |
| P2-8 malformed 文档 | PASS | unclosed fence / 表格 / `#######` / `<<<><>` 均不空白 |
| P2-9 零编辑切换等待 | PASS | 50 次切换 + 两 tick：dirty=false，bytes/hash/mtime 不变 |
| P1B-1/2 字节特征文档打开 | PASS | 01/11/12/08 打开后 dirty=false，两 tick 后 hash/mtime 不变（LF/CRLF/BOM/尾部全保） |
| P1B-3 干净 Cmd+S | PASS | 干净文档 Cmd+S 后 hash/mtime 不变 |
| P1B-4 中文+emoji 编辑保存重开 | PASS | 编辑→Save→重开 hash 一致 |
| P1B-5 autosave 工作流 | PASS | 编辑后等待 autosave 落盘，dirty 清除 |
| P1B-8 A/B 切换 | PASS | A 编辑→切 B 弹未保存对话框→discard→B 干净、A 磁盘不变 |
| P1B-10 冲突 toast 隔离 | PASS | 外部修改触发「文件已被外部修改」toast；Save 后 toast 不含正文内容 |

## 依赖自动化证据 / Reviewer 项

- P2-4 **Redo**（Cmd+Shift+Z）：WebKit WebDriver 无法注入 CM 组合键 keydown
  （实测 Meta+Shift+z 与 Meta+y 均不触发）。Undo 已验证。Redo 由 CM history
  adapter 测试覆盖，待真实键盘人工确认。
- **真 IME composition 会话**：WebKit WebDriver 无法注入 OS 级 IME 组合。
  `type` hook 是真实 CM 事务（与 IME commit 同路径），故标记「hook 驱动 + 待真 IME 人工」。
- **剪贴板 OS pasteboard**：execCommand('copy') 后读取 CM selection（copy 的实际字节）。

## 发现的产品问题（非阻塞，记录）

1. **P2-A：heading 级别类（`.mf-h1`–`.mf-h6`）从未应用**。
   `projection.ts` 的 `classifyNode` 返回 `{ cls: 'mf-h', level }`，但
   `buildDecorations` 的 active 分支（`mf-construct ${range.cls} ${PROJECTION_CLASSES.active}`）
   与 inactive 分支（`decorationFor(range.cls)`）都未传入 level，因此
   `.mf-h1`…`.mf-h6` CSS 规则不可达，裸 `.mf-h` 无样式。
   标题视觉语义仍成立（CM highlight 层提供 21px/700/accent），故 P2-1 通过，
   但标题「分级放大」不生效。建议归入 P3 corrective。
2. **P1B 冲突留存 receipt 阻塞后续打开**：冲突 Save 后若未处理，`lossless-receipts`
   目录留存 `state=conflict` receipt，重启后该文件打开被启动安全面拦截
   （日志 `Unfinished lossless save receipt found … state=Conflict`）。
   这是 P1B 设计内的防护行为，验收环境需隔离 data dir 规避；记录供后续评估。

## 证据文件

- `evidence-live-preview.png`：Live Preview 模式（light），heading/bold/italic/strike/code/link/quote/list/fence 全部可见
- `evidence-live-preview-dark.png` / `evidence-live-preview-sepia.png`：dark/sepia 主题
- `evidence-source.png`：Source 模式（原始 Markdown）
- 验收断言源码：`e2e/specs/lossless/p2-acceptance.e2e.mjs`
- 验收 runner：`e2e/run-lossless-acceptance.mjs`
