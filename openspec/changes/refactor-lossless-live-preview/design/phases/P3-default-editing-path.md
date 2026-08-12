# P3：默认编辑路径与常用能力迁移

## 1. 目标

把常用编辑命令、paste、图片、save/autosave/reload/conflict/export 输入和跨模式 History 迁移到 lossless CodeMirror 路径，并在证据充分后默认开启 `losslessCoreSession`。

## 2. 输入与依赖

- P2 Go；
- basic Live Preview、Source fallback、single History 稳定；
- `design/03-editor-live-preview-and-interactions.md`；
- `design/04-save-resource-conflict.md`；
- [P3 验证记录](../../validation/phases/P3.md)。

## 3. 实施范围

- command router：bold/italic/strike/link/heading/quote/list/fence；
- Enter/Backspace/Delete command matrix；
- paste/drop MIME/context pipeline；
- image insert/replace/delete 与资源事务；
- History grouping 与跨模式 Undo/Redo；
- autosave、external conflict、reload、close、save-as/new；
- export 读取 confirmed snapshot；
- outline/stats/status 完整迁移；
- lossless 默认开启，legacy 仅显式 flag 独立 session。

默认切换前必须冻结并通过以下 minimum parity，不得只以“可以回退源码”替代所有常用体验：

| 能力 | P3 默认门槛 |
| --- | --- |
| heading/strong/emphasis/strike/inline code/link/quote/list/fence | Live Preview 有可辨认语义样式；marker 至少弱化且活动范围完整 reveal |
| toolbar/shortcut/Enter/Backspace/paste/Undo/Redo | 对应本阶段 command matrix 全部可用，Source/Live Preview 使用同一 History |
| image | 插入、路径修改、删除、资源失败补偿可用；高级 image widget 可延后，但必须有安全、可编辑的 source fallback |
| table/task/frontmatter/reference/footnote/diagram/raw HTML | 未完成 widget 时允许 exact source fallback；必须可读、可选、可编辑、可复制、可保存，不得显示错误序列化结果 |
| selection/IME/accessibility | 基础 constructs 不跳光标、不丢 composition；键盘可进入/离开 fallback range |
| data/save | canonical L0/L1、autosave/conflict/reconcile、A/B 隔离全部通过 |

Program Owner 必须逐行记录 `PASS/FALLBACK-ACCEPTED/FAIL`。任一基础 construct 为 FAIL、fallback 不可编辑，或数据/保存项失败时，`losslessCoreSession` 保持 default-off。P4B 的高级视觉质量不阻塞 P3，但不能把未实现 widget 宣称为 WYSIWYG 已完成。

## 4. AI Coding 验证

AI 必须为每个 command 建 table-driven test，覆盖 collapsed/range/reversed selection、行首尾、nested constructs、CJK/emoji、malformed fallback 和 Undo/Redo。

专项验证：

- Enter：paragraph、heading、空/非空/嵌套 list、quote、fence、table fallback、跨块 selection；
- Backspace/Delete：marker 边界、block merge、atomic inline、image、malformed；
- paste：code literal、plain Markdown、sanitized HTML、Word-like HTML、file/image、异步切文档；
- toolbar/menu/shortcut 产生相同 source transaction；
- 一个 paste/structure/widget intent 一次 Undo；
- Live Preview 操作后切 Source Undo/Redo；
- pending image/resource failure 补偿；
- autosave、外部冲突、写盘期间继续输入；
- export 不改变正文/dirty；
- A/B 文档 command/History/resource 隔离；
- canonical fixtures 全工作流 bytes；
- 默认 flags 下重跑零编辑打开、两个 autosave tick、干净 Ctrl+S、模式切换、关闭/reopen，记录 dirty/save count/hash/length/mtime；
- legacy flag 与 default path owner 隔离。
- minimum parity matrix 每行都有自动化证据、人工结论和 fallback 截图/录屏。

运行完整 unit、typecheck、build、Rust、smoke/regression E2E、security、visual 和 IME gate。

## 5. 独立 Reviewer 验证

Reviewer 必须搜索并追踪所有保存消费者，证明默认路径不读取 PM/serializer/normalize；检查 command 只改局部 range；检查 resource transaction 失败补偿；检查 History 只有 CodeMirror owner；检查 default flag 回滚安全。

## 6. 人工验证

人工执行一份日常工作流脚本：

1. 新建文档并输入中文标题、段落、列表、引用、代码；
2. 用工具栏和快捷键格式化；
3. 在空/非空/嵌套列表使用 Enter/Backspace；
4. 粘贴网页 HTML、纯文本、代码和图片；
5. 修改/删除图片并撤销重做；
6. 在 Source/Live Preview 间切换继续 Undo/Redo；
7. 开启 autosave，外部修改同文件并处理冲突；
8. Save As、关闭重开、导出；
9. 同时操作 A/B 两文档；
10. 运行至少 30 分钟连续编辑并记录任何 selection、dirty、保存、资源问题。
11. 在默认 flags 下用全新 LF/CRLF/Mixed/BOM fixtures 执行零编辑 lifecycle 和干净 Ctrl+S，确认无写盘与关闭提示。

人工还需逐行填写 minimum parity matrix，并比较 legacy 与新路径的常用体验，列出阻止默认切换的问题。视觉差异可接受，但数据完整性、输入丢失、基础语义不可辨认、fallback 不可编辑和核心命令不可用不可接受。

## 7. 必须证据

- command matrix 自动化报告；
- paste/resource artifacts；
- History trace；
- default/legacy ownership trace；
- byte fixtures 全工作流结果；
- 30 分钟人工 observation；
- Reviewer save-path audit；
- rollback 演练。
- default minimum parity signed matrix。

## 8. Go/No-Go

Go：minimum parity 每行 PASS 或经 Program Owner 明确接受的 FALLBACK-ACCEPTED；默认 flags 的零编辑 lifecycle、常用工作流、数据完整性、History、资源、conflict、人工连续编辑通过；lossless 默认 flag 可安全发布。

No-Go：任何默认 save 依赖 serializer；常用 Enter/Backspace/paste 丢内容；Undo 跨模式断裂；图片异步串文档；rollback 无法保护当前输入。

## 9. 回滚

发布期关闭默认 flag，只影响新 session。当前 lossless session 必须先 flush/close。记录回滚原因和发生率；任何数据问题立即默认关闭，不等待下一版本。
