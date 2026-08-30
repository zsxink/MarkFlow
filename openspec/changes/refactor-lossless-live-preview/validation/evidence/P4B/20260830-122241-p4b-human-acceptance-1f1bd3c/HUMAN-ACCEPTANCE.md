# P4B 人工验收报告（Human Acceptance）

## 1. Identity

| 字段 | 值 |
| --- | --- |
| Phase | P4B（投影交互底座与轻量 Widgets） |
| Run ID | `20260830-122241-p4b-human-acceptance-1f1bd3c` |
| 验收人 | p4b-acceptance（独立人工验收代理） |
| Date/time | 2026-08-30 12:22 CST（桌面实测时间） |
| Branch | `test/issue-255-lossless-byte-contract` |
| Commit SHA | `1f1bd3c` |
| 应用构建 | e2e 模式 debug binary：`src-tauri/target/debug/markflow`（与 dist/ 同为 11:42 构建） |
| 构建方式 | `npm run build -- --mode e2e` + `tauri build --debug --features e2e --config src-tauri/tauri.e2e.conf.json` |
| 数据目录 | `/tmp/p4b-acc/data`（隔离） |
| 工作区 | `/tmp/p4b-acc/ws`（隔离， fixture 已恢复基线） |
| 环境 | macOS 26.5.2 / Darwin 25.5.0 ARM64 / Node v22.22.2 / Rust 1.96 / WebKit 605.1.15 |
| 当前系统输入法 | `com.apple.inputmethod.SCIM.ITABC`（中文 Pinyin），见 §6.2 |

## 2. 验收方法学披露（Methodology disclosure）

本次验收采用**混合方法**，明确区分真实人机交互与脚本辅助观察：

- **真实 GUI / HID 交互**：所有键盘操作（Cmd+A、Cmd+C、Cmd+X、Cmd+Z、方向键、字母键、Tab、Space、Return）均由自编的 Swift 小工具 `/tmp/p4b-acc/hid` 通过 `CGEvent(keyboardEventSource:…).post(tap: .cghidEventTap)` 投递到真实 Tauri WebKit 应用；鼠标点击由 WebDriver 在元素中心触发真实 OS 鼠标事件；截图是真实桌面窗口图像。
- **脚本辅助观察**：启用 `window.__setLosslessCoreSession`、`window.__setLivePreview`、`window.__setP4bFlag` 等 e2e-only hook；读取 DOM 状态（`.mf-marker`、`.mf-active`、ARIA、caret、selection、`view.composing`）和调用 `window.__markflowLossless` 调试 hook 均为脚本辅助。
- **辅助工具**：本验收的全部 spec 文件与 helper 均放在 `/tmp/p4b-acc/` 下，未改动仓库 `src/`、`src-tauri/`、`markflow-core/`、`e2e/**` 及任何既有证据文件。

## 3. 关键机制事实

### 3.1 P4B flag 仅存在于 e2e 构建

`__setP4bFlag` 由 `src/lib/lossless/cohortFlags.ts` 在 `import.meta.env.MODE === 'e2e'` 时才挂载；`__setLosslessCoreSession` 与 `__setLivePreview` 同理（`flag.ts:40`、`livePreviewFlag.ts:36`、`cohortFlags.ts:211`）。普通 dev/生产构建没有任何入口可启用这些项。因此：

> **视觉达到默认开启标准**、**键盘可达 widget**、**raw HTML policy** 等 ON 态观察，只能在当前 e2e 模式 debug 应用中完成；真实用户拿到的 release 包中这些能力不可达。

### 3.2 系统输入法为中文 Pinyin

实测时系统当前输入源为 `com.apple.inputmethod.SCIM.ITABC`。这导致 ASCII 字符输入会打开一个 IME composition 会话；在此会话期间 CodeMirror 的 `InputState.ignoreDuringComposition()` 会吞掉所有真实按键事件（包括 Cmd+Z），这是 P4B.md 已记录的设计事实，不是产品回归。本报告已用 per-keystroke trace 记录该现象（见 §6.2）。

## 4. 逐项结论

### 4.1 编辑自然，且 visible/dimmed marker 可发现（P4B 不验收 hidden）

- **结论：`accept`**
- 证据：
  - 在 `p4b-human-plain.md` 中，dimmed 状态下存在 15 个 `.mf-marker` span，首个 marker 的 computed opacity 为 `0.45`，颜色 `rgb(113,113,122)`，没有任何 marker 被设为 `display:none` / `visibility:hidden` / `opacity:0` 或零尺寸。
  - 当 caret 进入 `**加粗**` 区间后，bold construct 提升为 `.mf-active`，active construct 数从 `1`（heading，因为 caret 在 heading 边界）变为 `1` strong，marker span 数从 15 减为 14（promoted construct 不再显示离散 marker span）。
  - 截图：`shots/05-item1-markers-dimmed.png`（dimmed）、`06-item1-markers-revealed.png` / `07-item1-window-revealed.png`（revealed）。
  - 详见 `findings-editing.json`：`item1.caretAway.markers`、`item1.caretInsideBold.markers`。

### 4.2 光标和键盘行为可预测

- **结论：`accept`，附环境约束**
- 证据：
  - 真实 `ArrowRight` 连按 12 次穿过 `*斜体*` 等 marker 区域，每次 source offset 严格 +1，无跳格/吞字：`item2.arrowWalk` 中 `allDeltasAreOne = true`。
  - 真实 HID 输入 `abc` 落在光标处；由于 Pinyin IME 打开，per-keystroke trace 显示 `view.composing: true`，IME 自身在 `a` 与 `b` 之间插入分隔空格随后合并为 `abc`；按 `Return` 提交后 `composing: false`，再按 `Cmd+Z` 精确恢复到原文；磁盘在 11s autosave 窗口后未变：`item2.typing.singleUndoRestoredBytes = true`、`diskUnchangedAfterAutosaveWindow = true`。
  - 这表明：在 IME composition 期间 `Cmd+Z` 不生效（已知/已文档化约束），但提交后 Undo 工作正常。
  - 截图：`shots/08-item2-caret-walk.png`、`09-item2-real-typing.png`。
  - 详见 `findings-editing.json`：`item2.arrowWalk`、`item2.typing.*`。

### 4.3 失败后可回到源码

- **结论：`accept`**
- 证据：
  - 注入 `failAlways()` 后，`projectionState = 'degraded'`，`.mf-marker` span 数 = 0，decorations = `{}`，source 文本完整不变：`item3.degraded.sourceUnchanged = true`。
  - 在 degraded 表面上仍可用真实 HID 输入 `xy`，提交后用 1 次 `Cmd+Z` 恢复到原始 bytes，保存成功：`item3.fallbackEditable = true`、`item3.restoredByUndo = true`、`item3.saveResult = 'saved'`。
  - 清除 failure 后 projection 恢复为 `rendered`，marker 数恢复为 15：`item3.recovered.projectionState = 'rendered'`、`item3.recovered.markerCount = 15`。
  - 截图：`shots/10-item3-fallback-to-source.png`、`10b-item3-fallback-typing.png`、`11-item3-recovered.png`。
  - 详见 `findings-editing.json`：`item3.*`。

### 4.4 视觉达到默认开启标准

- **结论：`accept`（限于 e2e-only flag 场景）**
- 证据：
  - **task checkbox**：在 light/dark/sepia 三主题下 widget 尺寸均 >0，role=`checkbox`，aria-label 包含任务文本，截图 `shots/12-item4-task-*`。
  - **code fence controls**：三主题下 widget 尺寸 `30×105`，region role，aria-label=`代码块 js`，复制按钮和语言 badge 均可见，截图 `shots/14-item4-fence-*`。
  - **frontmatter policy**：未产生独立 widget DOM（`item4.frontmatter.aria = null`），保持 source-only，与 design 一致。
  - **raw HTML policy**：显示为源码化文本块，未渲染为 live DOM，见 §4.6。
  - 截图：`shots/16-item4-frontmatter.png`、 `18-item4-rawhtml-policy-on.png`、 `19-item4-rawhtml-policy-on-editor.png`。
  - 详见 `findings-visual.json`：`item4.*`。

### 4.5 screen reader / keyboard-only 完成

- **结论：`conditional-accept`**
- 证据：
  - **Tab 可达**：从编辑器按真实 Tab，第 1 次焦点即落在 task checkbox widget（`.mf-widget-task`，role=`checkbox`，tabindex=`0`，outline=`2px solid`）；随后可达第二个 checkbox、工具栏各按钮（保存/导出/设置）。`item5.reachedTaskWidgetByTab = true`。
  - **Space 可操作**：widget 获得焦点后按真实 Space，source 从 `- [ ]` 变为 `- [x]`；再 `Cmd+Z` 恢复：`item5.spaceToggledSource = true`、`item5.undoRestored = true`。
  - **ARIA 属性**：task checkbox 有 `role="checkbox"`、`aria-checked="false"`、`aria-label="任务 - [ ] widget task 🚀"`；fence widget 有 `role="region"`、`aria-label="代码块 js"`。
  - **仍无法人工验收**：真实 macOS VoiceOver 朗读序列、rotor、高对比/减弱动态效果下的 OS 行为未实测；本验收不能代替残障用户真实使用测试。
  - 截图：`shots/21-item5-tab-walk-end.png`、`22-item5-widget-focus-space.png`。
  - 详见 `findings-visual.json`：`item5.*`。

### 4.6 安全/资源负责人已参与高风险 widget（raw HTML）

- **结论：技术行为 `accept`；治理签字 `cannot-verify`**
- 证据（技术）：
  - raw HTML policy flag OFF：`__p4bExecuted === false`、`.source-editor-wrapper` 内无 `<script>` 元素、无 `.mf-html-block`。
  - flag ON：出现 `.mf-html-block`，但 `scriptExecuted = false`、`scriptElementsInEditor = 0`、`divWithDataX = 0`、`liveDivs = []`，source 文本未变：`item6.flagOn.sourceUnchanged = true`。
  - 即 raw HTML 在 P4B 中保持源码化 / inert，不执行脚本，不实例化 raw `<div data-x="1">` 为可交互 DOM。
  - 截图：`shots/18-item4-rawhtml-policy-on.png`、`19-item4-rawhtml-policy-on-editor.png`、`23-item6-rawhtml-inert.png`、`24-item6-rawhtml-inert-editor.png`。
- 证据（治理）：
  - 在 `openspec/changes/refactor-lossless-live-preview/` 内搜索「安全负责人」「security owner」「安全/资源负责人」等关键词，仅命中阶段文档模板本身，未找到安全/资源负责人对 raw HTML widget 的签字或 review 记录。
  - 因此「人类安全/资源负责人已参与」这一项无法由本次验收确认，标记为 `cannot-verify`。
  - 详见 `findings-visual.json`：`item6.*`。

## 5. 系统 pasteboard 端到端（残余项人工补齐）

- **结论：`accept`**
- 方法：在真实运行中的应用里，用 `/tmp/p4b-acc/hid` 投递 `Cmd+A` → `Cmd+C`（或 `Cmd+X`），然后在 shell 中用 `pbpaste` 读取 macOS general pasteboard 的 `text/plain`，与 CodeMirror 内存 doc 及磁盘 fixture 逐字节比较。
- 结果：
  - `p4b-widget-fence.md` + `codeFenceControls` ON：
    - source = `before\n\n\`\`\`js title="keep"\nconst x = 1;\n\`\`\`\n\nafter\n`，长度 51 bytes，SHA-256 `faeda8aef88be91e9b6ddf84ebab258235ef78c36d296a7dbcf61d3e70b2b1b4`。
    - `pbpaste` 输出完全相同，SHA-256 一致，`byteIdenticalToInMemoryDoc = true`、`byteIdenticalToDiskFile = true`。
    - 渲染 DOM text 包含 widget chrome（`js复制js`），但 pasteboard 中不含 `复制`，证明 payload 来自 source 而非 DOM text。
  - `Cmd+X`：pasteboard 仍为完整 51-byte source；doc 被清空；一次 `Cmd+Z` 恢复；11s autosave 窗口后磁盘 fixture 未变：`clipboard.cut.diskUnchangedAfterAutosaveWindow = true`。
  - 部分选择（`Cmd+Up` 到文档头，再 `Shift+Down×3`，`Cmd+C`）：pasteboard 为 `before\n\n\`\`\`js title="keep"\n`（source 子串，非 DOM 文本），`clipboard.partial.isSourceSubstring = true`、`isWholeDoc = false`。
  - 基线文档 `p4b-human-plain.md`，所有 P4B flag OFF：`Cmd+A` → `Cmd+C` 同样逐字节与 source 和磁盘一致。
  - 详见 `findings-clipboard.json`；原始 wdio 日志 `run1.log`。

## 6. 无法验收的 still-open 项

| # | 项 | 原因 |
| --- | --- | --- |
| 1 | 真实 VoiceOver 屏幕阅读器朗读与 rotor 顺序 | 没有音频捕获 / VoiceOver 自动化基础设施；仅验证了 ARIA 属性与 Tab 焦点 |
| 2 | OS 高对比度 / 减弱动态效果下的 widget 渲染 | 未启用系统级 `prefers-contrast` / `prefers-reduced-motion` 并人工观察 |
| 3 | 原生打印对话框 / 导出 PDF 视觉 | 未实测打印路径 |
| 4 | 安全/资源负责人对 raw HTML 高风险 widget 的人类签字 | 仓库内无相关记录 |
| 5 | 真实 CJK 日文 IME 之外的其他输入法（如韩文、第三方） | 已超出 P4B 范围，本次未覆盖 |

## 7. AI 人工验收建议

- **总体建议：`conditional-accept`（建议接受 P4B-SUBSTRATE 与三个低风险 item，raw HTML 需补齐安全 owner 签字）**
- **P4B-SUBSTRATE**：建议 `accept`。真实桌面交互底座（visibility、owner registry、widget protocol、source-fallback、clipboard source contract）在人工观察下行为一致，且已有自动化证据支持。
- **task checkbox / code fence controls**：建议 `accept`（视觉、键盘、Undo、export、clipboard 均通过）。
- **frontmatter policy**：建议 `accept`（保持 source fallback，未引入不稳定 projection）。
- **raw HTML policy**：建议 `conditional-accept` — 技术行为满足「默认 inert / 不执行脚本 / 不泄漏 live DOM」，但**必须**由安全/资源 owner 补签字后方可 `accept`；目前阶段若未补齐，应标记 `NO-GO` 并保持 source fallback。

## 8. 最终说明

- 本验收人**不批准最终 Go**。最终 Go（`P4B-SUBSTRATE-GO`、`P4B-ITEM-*-GO/NO-GO`）必须由主会话在独立 Reviewer、人工验收与 Program Owner 齐备后记录。
- 本报告及截图已落盘至 `openspec/changes/refactor-lossless-live-preview/validation/evidence/P4B/20260830-122241-p4b-human-acceptance-1f1bd3c/`。
