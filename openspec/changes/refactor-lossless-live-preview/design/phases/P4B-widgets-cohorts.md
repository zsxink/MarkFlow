# P4B：Marker Cohorts 与高级 Widgets

## 1. 目标

逐项提升 Live Preview 质感。每个 cohort/widget 独立交付、独立验证、独立回滚，不能以“整体大致可用”掩盖 selection、IME、安全或 byte 问题。

## 2. 输入与依赖

- P4A Go 或该 widget 仅需可信 local ranges；
- widget protocol、owner registry、source fallback；
- [P4B 验证记录](../../validation/phases/P4B.md)，并为每项建立子运行记录。

## 3. 实施顺序

marker cohorts：heading+strong；emphasis+strike+inline code；links；quote+lists；fence。

widgets：task checkbox；code fence controls；image；GFM table；frontmatter；Mermaid/PlantUML；raw HTML policy。

每项必须在当前 program 分支建立独立 flag、任务组、evidence run 和验收结论，声明 source range、交互、History、failure fallback、security、accessibility 和 export；不再新建 child Issue/change。

## 4. AI Coding 验证

每项通用矩阵：

- inactive/active/selected/composing/revealed/fallback states；
- mouse click/drag/double click；
- Arrow/Home/End/Shift+Arrow/Tab/Enter/Space/Backspace/Delete；
- Select All、copy/cut/paste；
- CJK/emoji/IME；
- Undo/Redo 与模式切换；
- read-only、zoom、三主题、high contrast、reduced motion；
- screen reader role/name/state；
- async cancel、stale identity、error、Retry；
- local/core owner handoff；
- source range 局部 patch 与未触及 bytes；
- viewport create/dispose 与 memory leak；
- export/print fallback；
- security payload 与 URL policy。

专项：table 必测 cell navigation、escaped pipe、alignment、row/column operation；image 必测 alt/path/title、pending resource、broken URL；diagram 必测恶意源码、timeout、network policy；raw HTML 必测 XSS。

## 5. 独立 Reviewer 验证

每项独立 review，不接受一次 review 覆盖全部。Reviewer 检查 DOM 不成为正文、所有 commit 走 CM transaction、async identity、资源安全、keyboard/a11y、source fallback 和 flag cleanup。

## 6. 人工验证

每项至少一名验收人按同一矩阵实际操作，并记录：编辑是否自然、marker 是否可发现、光标是否可预测、键盘是否能完成、错误后是否能回源码、视觉是否达到默认开启标准。

image/table/diagram/raw HTML 还需安全/资源负责人参与；accessibility 关键 widget 需要 VoiceOver 或等价 screen reader 验证。

## 7. 必须证据

- 每项 unit/semantic/visual/IME/a11y/security 结果；
- source before/after byte report；
- keyboard 与 screen reader 记录；
- async failure/cancel artifacts；
- independent review；
- 人工 Accept/Reject；
- flag default decision。

## 8. Go/No-Go

单项 Go 才能 default-on。任何 selection trap、输入丢失、错误 source patch、安全问题或不可回源码均 No-Go。单项 No-Go 不阻塞其他项和基础编辑器，但必须保持 default-off/source fallback。

## 9. 回滚

关闭单项 flag，dispose widget/decoration，显示同一 range 的 local projection 或源码。回滚不得改变正文、History、dirty 或 Core revision。
