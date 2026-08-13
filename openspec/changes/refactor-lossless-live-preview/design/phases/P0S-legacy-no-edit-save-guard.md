# P0S：Legacy 零编辑写盘安全止血

## 1. 目标

在不宣称解决编辑后 byte-to-byte 的前提下，立即阻止 legacy ProseMirror 路径“只打开、零编辑即 dirty 并被 autosave/关闭流程写回磁盘”。P0S 是当前 program 分支中的独立产品安全 checkpoint；它不扩展 `trailingNewlines` 元数据，不把 ProseMirror serializer 变成无损真相，也不替代 P1A/P1B。

## 2. 输入与依赖

- P0 corrective run 已 Go，零编辑失败具有真实 lifecycle 证据；
- 原始失败 run、人工 hash/mtime 记录与根因调用链；
- `autosave-dirty-guard` capability；
- [P0S 验证记录](../../validation/phases/P0S.md)。

P0S 与 P1A 在 P0 Go 后可以在同一分支按不重叠模块推进，但分别使用独立 commit/evidence checkpoint；任何继续提供 legacy 默认路径的可发布/人工验收构建必须先通过 P0S。P1B 必须重跑并继承 P0S 场景，不能依赖 P0S 的 legacy 状态作为 Core dirty 真相。

## 3. 实施范围

1. `setEditable`/read-only 同步不得发送正文 update；只有状态实际变化时才调用，并显式关闭 update emission；
2. hydration/programmatic transaction 使用明确来源或 transaction meta，不依赖 debounce 执行时读取易失 boolean；
3. legacy dirty 临时改为用户文档 transaction/revision 驱动，打开 hydration 不增加 user revision；
4. `markDocumentPersisted` 不再通过 `getMarkdown()`/serializer/normalize 回比来判 dirty；
5. autosave 与 `saveActiveDocument` 都增加 clean-session 硬保护，零确认编辑直接 `skipped`；
6. 保存原始打开 snapshot/hash；干净文档显式 Save 直接跳过，禁止为了“保存”调用 serializer 写盘；
7. 将 P0 零编辑预期失败场景转为默认长期绿色 regression；
8. 不承诺编辑后的未触及 byte 保真，不修改 Core、Live Preview 或最终保存协议。
9. 用户正文 transaction 必须在 ProseMirror dispatch 同一调用栈内同步增加 revision 并更新 dirty；debounce 只能用于状态栏、outline 等非权威 UI 刷新；
10. 未分类但会改变 document 的 transaction 必须按用户编辑保守处理；hydration、reload、Source→WYSIWYG 投影与资源显示重写必须在同一 transaction 上携带明确 origin/meta；
11. Cmd+S、A→B 切换、reload 与 close 的最终 gate 必须读取 revision 真相，覆盖“输入后小于任意 debounce 窗口立即操作”的边界；
12. 文档切换选择“保存”时，只有 `SaveResult === 'saved'` 才能继续；`skipped`、`failed` 或 in-flight save 均必须留在当前文档。

## 4. AI Coding 验证

AI 必须验证：

- `setContent`、`setEditable(false/true)`、read-only 切换和打开 hydration 均不增加 user revision；
- LF、CRLF、CR、Mixed、BOM、tail0/1/2/3 fixtures 打开后 dirty=false；
- autosave 开启并等待至少两个 tick，save count=0、无 write 调用、hash/length/mtime 不变；
- 关闭/切换未编辑文档不弹保存提示；
- 干净文档 Ctrl+S 不调用 serializer/write，返回可解释 `skipped`；
- 一个真实用户输入 transaction 会增加 revision、进入 dirty，并仍可走 legacy 保存；该保存的已知 byte 损坏继续作为 characterization 记录，不能误报已解决；
- 用户输入后不等待 timer，立即 Cmd+S 必须写入当前 revision；立即切换/关闭必须阻断并提示；
- 写盘 in-flight 时产生新 transaction，旧 revision 保存完成后必须保持 dirty，第二次保存后才收敛；
- A 编辑后立即切换 B，不得由 A 的延迟任务污染 B，也不得丢失 A；
- `SaveResult` 三态有回归测试：仅 `saved` 允许切换，`skipped`/`failed` 均阻断；
- autosave/save 双重 clean guard 有 integration test，不能只断言 UI dirty；
- 默认 unit/typecheck/build/Rust/E2E/OpenSpec gates 通过。

## 5. 独立 Reviewer 验证

Reviewer 必须检查：

- 修复没有把 baseline 改成 serializer 输出来掩盖 dirty；
- 没有通过关闭全局 autosave、扩大 `trailingNewlines` 或忽略 update 解决；
- programmatic/user transaction 分类对 toolbar、paste、undo、模式切换没有误判；
- revision/dirty 不由 debounce timer 更新；Reviewer 必须实际检查 transaction meta 与未知 transaction 的 fail-safe；
- clean guard 位于最终 write 入口之前，调用者状态错误时仍不写盘；
- 原 P0 failing run 保持不可变，新 regression 明确链接它；
- 重跑至少一组 LF、一组 CRLF/Mixed 和一次真实 desktop autosave 生命周期。
- 自建小于旧 debounce 窗口的立即 Save、A→B、close 复现；验证写盘期间继续输入仍 dirty。

## 6. 人工验证

人工使用与 P0 相同的全新副本和 autosave 配置：

1. 对 LF/CRLF tail2/tail3 分别打开，零编辑等待两个 tick；
2. 确认 dirty=false、mtime/hash/length 不变、关闭无提示；
3. 对一个干净副本按 Ctrl+S，确认仍不写盘；
4. 切换只读→可写和打开 A/B 文档，确认均不产生 dirty/写盘；
5. 在另一全新副本输入一个字符，确认 dirty 与保存仍工作；
6. 明确记录“编辑后 byte fidelity 仍未由 P0S 修复，最终验收在 P1B”。
7. 在全新副本输入一个字符后，不等待，立即 Cmd+S；重开确认字符存在；
8. 在 A 输入一个字符后，不等待，立即点击 B；必须先出现 A 的未保存提示，取消后仍停留在 A；
9. 在全新副本输入一个字符后，不等待，立即关闭窗口；必须出现未保存提示，取消后内容仍在。

## 7. Go/No-Go

Go：所有零编辑路径 save count=0，hash/length/mtime 不变，无关闭提示；真实用户编辑在 transaction 同一调用栈内进入 dirty；立即 Save/切换/关闭和 in-flight-save 边界通过；Reviewer 与人工通过。

No-Go：任何零编辑写盘、用 serializer 输出掩盖 dirty、全局关闭 autosave、真实编辑不再标脏，或报告声称已完成编辑后 byte-to-byte。

## 8. 回滚

P0S 是 legacy 安全补丁，可独立回滚，但回滚后 legacy autosave 必须 default-off 且明确警告数据风险，直到 P1B lossless path 可用。进入 lossless session 后不得把文档热切回 P0S/ProseMirror owner。
