# P4B：投影交互底座与轻量 Widgets

## 0. 状态与定位

P4B 是 P6/P7 的基础设施阶段，不是 Typora marker hiding 的交付阶段。它建立统一 owner、source range、interaction harness、widget protocol 和轻量 widget；marker 在 P4B 期间保持 `visible/dimmed/revealed`，真正 `hidden` 统一由 P6 交付。

该分工以 [Typora 投影与交互 ADR](../../adr/adr-typora-projection-interaction-contract.md) 为准，解决旧设计中 P4B/P6 同时负责 hiding 的冲突。

## 1. 目标

- 冻结 `visible/dimmed/hidden/revealed` 派生状态 API、construct range 与 reveal contract；P4B 不开启 hidden 输出。
- 建立每个 construct identity 唯一 `local/widget/source-fallback` runtime owner registry，并定义父子 editable slot 仲裁。
- 建立 widget protocol、atomic range、focus/selection、History、async identity、fallback、security、a11y 和 export 合同。
- 交付 task checkbox、code fence controls、FrontMatter safe projection 与 raw HTML policy。
- 建立 P6/P7 共用的真实桌面交互矩阵，偿还 P3 的真实 IME 证据债。

## 2. 输入与依赖

- P3 默认路径候选及 minimum parity 证据；
- P4A 的 technical terminal 与 parser/source-map ADR：只使用受信 Lezer local ranges；
- `specs/typora-wysiwyg-editing/spec.md` 与 `specs/rich-markdown-blocks/spec.md`；
- [P4B 验证记录](../../validation/phases/P4B.md)。

## 3. 实施范围

### 3.1 共用交互底座

- construct descriptor：kind、source/content/marker ranges、owner、revision、fallback；
- visibility resolver：只产出 `visible/dimmed/revealed`，保留 P6 的 `hidden` extension point；
- selection/caret/affinity 与 atomic range protocol；
- source-based plain-text clipboard 与显式 accessibility descriptor；
- mouse/keyboard/IME/input-rule/Undo/viewport/fallback test harness；
- per-item flag、owner cleanup 和 E2E debug snapshot。

### 3.2 轻量 widgets

1. task checkbox；
2. code fence language/control；
3. FrontMatter safe projection，复杂 YAML/TOML 回源码；
4. raw HTML 默认源码或严格 sanitize 的只读 preview。

Image、GFM table、Mermaid/PlantUML 移交 P7，但仍属于 Issue #254 必达范围，不再是 program 外 backlog。

## 4. 通用交互矩阵

每项必须覆盖：

- inactive/active/selected/composing/empty/fallback/source/read-only；
- click/drag/double-click、Arrow/Home/End/Shift+Arrow/Tab/Enter/Space/Backspace/Delete；
- Select All、copy/cut/paste、input rule 形成/拆除 construct；
- 中文/日文真实 IME、emoji、combining character；
- Undo/Redo、Source 往返、toolbar/shortcut；
- 三主题、zoom 200%、high contrast、reduced motion；
- screen reader role/name/state/focus；
- stale/cancel/error/Retry、跨文档 identity；
- source patch、L1 surviving spans、flag rollback；
- viewport create/dispose、memory、export/print；
- URL、HTML、SVG 与 payload 安全。

P4B 必须补齐空 heading/list/quote、Select All 不整篇闪烁、Undo 落点在 marker、composition 起始于 marker 邻域和跨 nested construct 选区等场景，即使 hidden 输出尚未开启。

## 5. 退出门禁

P4B 使用两个不同层级的决定，禁止再写含糊的“P4B Go”：

1. `P4B-SUBSTRATE-GO`（P6/P7 强制前置）：共用 interaction harness 在真实 Tauri WebView 通过；中文与日文 IME 至少在可用平台各有一轮真实证据；visibility/atomic/clipboard/a11y、owner registry、widget protocol 与 flag rollback 通过自动化、独立 Reviewer 和人工验收，且不改变 doc、History、dirty、revision 或 bytes。
2. `P4B-ITEM-<name>-GO/NO-GO`：task checkbox、fence controls、FrontMatter、raw HTML 分别决定 maturity/default/fallback。单项 No-Go 不否定已通过 substrate，也不阻塞 P6；该 item 仍属于 P7 收口与最终支持矩阵，P7 未解决前不能进入 P5。

记录 `P4B-SUBSTRATE-GO` 后，P6 可只实现 visibility output 与 construct-specific polish，不需要重建协议；P7 可消费 widget protocol 并继续未完成轻量 items。

任何 selection trap、输入丢失、错误 source patch、安全问题或不可回源码均阻止 `P4B-SUBSTRATE-GO`；仅限 item 自身的视觉/功能失败则记录为该 item No-Go 并保持 source fallback。

## 6. 回滚

关闭单项 flag，dispose widget/decoration，显示同一 range 的 dimmed local projection 或完整源码。回滚不得切换正文 owner、重建文档或调用 serializer。
