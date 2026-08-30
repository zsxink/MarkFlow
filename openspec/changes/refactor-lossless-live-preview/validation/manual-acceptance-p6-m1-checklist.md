# P6 M1 人工验收脚本（隐藏 marker：heading / paragraph / thematic break）

> 前置条件：
> - P6 M1 独立 Reviewer 复核 = **PASS**（纠正 run `20260830-180950-p6-m1-corrective-4f010c3`，commit `4100228`）。
> - 自动 gate 全绿（tsc / projection 47 / npm test 858 / build / byte-contract L0+L1 / openspec 61·61）。
> - 本脚本是「四者验收」中的**人工验收**腿；由主会话派出的验收人（或 Program Owner 在真实桌面应用）执行。
> - **实现 AI 不签署 Go**；结论为 ACCEPTED 后仍需 Program Owner(xian) 记录 Go。
> - P6 flag 默认 OFF；本验收在「开启 flag」与「关闭 flag 回退 source」两种状态下都验证。
> - 关联证据：纠正 run `20260830-180950-p6-m1-corrective-4f010c3/REVIEW.md`（Q2–Q6 非阻塞）。

环境：
- 应用：以 e2e 特性构建并启动 debug 应用 —— `npm run test:e2e:build` 后启动
  `src-tauri/target/debug/bundle/macos/MarkFlow.app`（或 `npm run tauri dev` 若 flag hook 可达）。
  flag 钩子被 `import.meta.env.MODE === 'e2e'` 门控，故必须用 e2e 构建，否则 hook 不可达。
- 工作目录：任意真实 Markdown 文档（建议 `/Users/xian/markflow-test` 下新建）。
- 开启 flag（验收人通过 webview 控制台调用 E2E hook，或设 localStorage）：
  - `window.__setLivePreviewFlag('heading', true)` + `window.__setLivePreviewFlag('heading.hidden', true)`
  - `window.__setLivePreviewFlag('thematicBreak', true)` + `window.__setLivePreviewFlag('thematicBreak.hidden', true)`
  - 关闭：`window.__setLivePreviewFlag('heading.hidden', false)`（回 dimmed）/ `window.__setLivePreviewFlag('heading', false)`（回 source）。
    `thematicBreak` 同理。

## 1. Heading 隐藏 marker（active / inactive / 空 heading）
- [ ] 非活动状态：`# 标题` 只渲染为语义标题，源码 `# ` 不可见（被 atomic 隐藏）。
- [ ] 光标进入标题 / 点击标题 → 立即揭示可编辑 `# ` marker，可正常编辑、不跳光标。
- [ ] 空 heading（`#` 后无内容）：保持可发现（不隐藏），光标可输入。
- [ ] 标题内 Enter → 新块；空标题 Enter 退出 heading（marker 行为可预测）。
- [ ] 上述各一次 Undo 撤销一步（History 连续）。

## 2. Thematic break 隐藏 marker
- [ ] 非活动状态：`---`（或 `***` / `___`）渲染为分隔线（widget rule），源码 `---` 不可见。
- [ ] 光标进入 / 点击 → 揭示可编辑 `---`，可改文字、不丢上下文。
- [ ] **已知项 Q3（非阻塞，待后续独立修复）**：revealed / source-only 状态下 `.mf-hr` 规则若高度坍塌会使 `---` 不可见。实现 AI 已回退相关 CSS 改动以保持纠正 run 测试专用；验收时记录该视觉表现，不因此判 REJECTED。
- [ ] `---` 周边 Enter / Backspace 是普通文本编辑，不破坏分隔线。

## 3. Paragraph（无 marker）
- [ ] paragraph 无 marker，渲染与 source 一致，开关 flag 无差异。

## 4. 同文档混合 cohort
- [ ] 一个文档含 标题 + 段落 + 分隔线，三者在 active / inactive 间切换互不干扰；Select All 不整篇闪烁。

## 5. 真实 IME（CJK + 日文）邻 marker
- [ ] 中文 Pinyin / 日文 Kotoeri 在标题 marker 邻域输入：不闪烁、不丢字、不取消、一次 Cmd+Z 精确还原。
- [ ] composition 期间 keymap 冻结属预期（见 P4B 7.3 设计事实：composing>0 时 CodeMirror 吞真实按键），不代表缺陷。
- [ ] **PENDING-MANUAL**：真实设备 IME 行为以 Program Owner 本机为准（自动化套件已覆盖 composition 路径，但真实输入法需本机确认）。

## 6. 键盘语义（hidden marker 邻域无陷阱）
- [ ] Arrow / Home / End / Shift+Arrow / Backspace / Delete 在隐藏 `# ` / `---` 邻域：selection 不跳变、不 trap。
- [ ] 双击 / 拖选跨 marker：selection 正确包含源码字符。

## 7. 复制 / 剪切含 source（非 widget chrome）
- [ ] 选中含隐藏标题 / 分隔线的文本 → Cmd+C / Cmd+X，剪贴板载荷来自 **source**（`# 标题` / `---`），不含渲染 chrome。

## 8. Source/Live 切换 + Undo 连续 + flag 回退
- [ ] Live 编辑后切 Source，Cmd+Z 按同一 History 撤销。
- [ ] 关闭 `heading.hidden` → 标题回 dimmed（`# ` 弱显示）；关闭 `heading` → 回纯 source（`# ` 正常显示）。doc / History / dirty / revision / bytes 不变。

## 9. 字节合同不变量（显隐不改变 bytes）
- [ ] 零编辑打开文档，等待两个 autosave tick / 干净 Ctrl+S / 关闭重开：mtime / hash / length 不变、无写盘、无关闭提示。
- [ ] 局部编辑标题 / 分隔线文字：仅目标 span 改变，前后字节原样保留（L1）。
- [ ] 开启 flag 编辑 → 保存 → 重开 → 字节与关闭 flag 时一致（隐藏不影响持久化）。

## 10. a11y / 主题 / read-only
- [ ] Screen Reader（VoiceOver）：标题 / 分隔线语义可被朗读；keyboard-only 可完成主要操作。
- [ ] 高对比 / zoom / light·dark·sepia 主题 / read-only：隐藏 marker 表现正常。
- [ ] **PENDING-MANUAL**：VoiceOver / 高对比 / 原生打印等以本机为准。

## 11. 视觉基线
- [ ] light / dark / sepia 下，隐藏 / 揭示 / dimmed 三态视觉可辨认、无重叠 / 错位。
- [ ] **PENDING-MANUAL**：正式视觉基线截图集待本机采集。

## 12. 长时稳定
- [ ] 反复开关 flag + 编辑 ≥ 8 分钟：无内存泄漏、无 decoration 残留、无崩溃。
- [ ] **PENDING-MANUAL**：≥8h / ≥2 sessions soak 留待发布前 P5 阶段。

## Kill-switch 判据（任一发生 → REJECTED 并立即关闭默认 flag）
- [ ] 任何打开即 dirty / 非用户编辑写盘 / serializer 保存 / 字节被改（L0/L1 失败）
- [ ] widget DOM 进入正文 / selection trap / 输入丢失 / 数据丢失
- [ ] 真实 IME 丢字或取消（本机确认）
- [ ] screen reader 完全不可用 / 关键操作 keyboard-only 不可完成

## 验收结论
- [ ] 全部项 PASS 或明确接受的 FALLBACK / PENDING-MANUAL（非阻塞）
- [ ] Q3 视觉项已记录（待后续独立修复 commit）
- [ ] 结论：**ACCEPTED / REJECTED**（如 REJECTED 列出阻塞项）

验收人：____________  日期：____________
