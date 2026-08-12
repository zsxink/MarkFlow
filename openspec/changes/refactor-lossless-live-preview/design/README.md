# Issue #254 详细设计文档索引

## 1. 文档目的

本目录把 umbrella `design.md` 拆成可由 AI Coding Agent 分阶段执行、由 Program Owner 逐阶段人工验收的设计包。Issue #254 使用 Program Owner 批准的单分支连续交付例外：从当前分支 `test/issue-255-lossless-byte-contract` 和 umbrella change `refactor-lossless-live-preview` 持续完成 P0 corrective、P0S、P1A–P5，不再为后续阶段建立新 Issue、branch、child change 或阶段 PR。单分支不等于无阶段门禁；每个阶段仍必须形成可审查 commit checkpoint、独立 evidence run、Reviewer 结论、人工验收和 Go/No-Go，直到全部重构完成。

## 2. 规范优先级

从高到低依次为：

1. `specs/*/spec.md`：用户可观察行为与不可破坏合同。
2. 本目录专题设计：组件边界、状态机、数据协议、失败语义。
3. 本目录阶段设计：依赖顺序、交付范围、验证与退出门禁。
4. `tasks.md`：program 级工作清单。
5. [validation/](../validation/README.md)：AI 运行记录、Reviewer 报告、人工验收表和证据索引。

验证记录不能降低规范要求。若实现发现规范不可行，必须先修改 OpenSpec 并重新评审，不能在验证报告中自行豁免。

## 3. 专题设计

| 文档 | 负责的问题 |
| --- | --- |
| [00-program-governance.md](./00-program-governance.md) | 分支、child change、角色、证据、Go/No-Go、回滚和完成定义 |
| [01-byte-fidelity-and-position.md](./01-byte-fidelity-and-position.md) | L0/L1 byte 合同、BOM/EOL、PositionMap、fixtures 和保存判定 |
| [02-core-session-and-sync.md](./02-core-session-and-sync.md) | Core session、revision、patch、bridge、optimistic/confirmed 同步和 resync |
| [03-editor-live-preview-and-interactions.md](./03-editor-live-preview-and-interactions.md) | 单一 CodeMirror、投影、selection、marker、Enter/Backspace、paste、History |
| [04-save-resource-conflict.md](./04-save-resource-conflict.md) | 原子保存、autosave、外部冲突、图片资源事务、reload/close/save-as |
| [05-render-ir-widgets-nfr.md](./05-render-ir-widgets-nfr.md) | parser spike、Render IR、widgets、性能、安全、可访问性和观测性 |

## 4. 阶段设计

| 阶段 | 文档 | 产品状态 | 退出结果 |
| --- | --- | --- | --- |
| P0 | [P0-baseline-contract.md](./phases/P0-baseline-contract.md) | 默认仍为 ProseMirror | 现有失败可重现，byte 合同可机器判定 |
| P0S | [P0S-legacy-no-edit-save-guard.md](./phases/P0S-legacy-no-edit-save-guard.md) | legacy 安全止血 | 零编辑打开/等待/关闭绝不写盘；不宣称编辑后保真 |
| P1A | [P1A-lossless-core.md](./phases/P1A-lossless-core.md) | 无 UI 切换 | Core 可无损 open/patch/save payload |
| P1B | [P1B-source-vertical-slice.md](./phases/P1B-source-vertical-slice.md) | lossless Source flag | 真实桌面 Source 打开、编辑、保存、重开闭环 |
| P2 | [P2-live-preview-surface.md](./phases/P2-live-preview-surface.md) | CodeMirror Live Preview flag | 单一 EditorView 提供基础 Markdown 语义投影 |
| P3 | [P3-default-editing-path.md](./phases/P3-default-editing-path.md) | lossless path 默认开启 | 常用编辑、资源、保存、History 进入默认路径 |
| P4A | [P4A-render-ir.md](./phases/P4A-render-ir.md) | Core IR 增强 flag | `GO_CORE_IR`，或以 `SPIKE_COMPLETE_NO_CORE_IR` 保持 local/source fallback |
| P4B | [P4B-widgets-cohorts.md](./phases/P4B-widgets-cohorts.md) | widget/cohort 独立 flag | 高级投影逐项通过交互与保真门禁 |
| P5 | [P5-release-legacy-cleanup.md](./phases/P5-release-legacy-cleanup.md) | 新路径稳定发布 | 删除 legacy 产品真相与 serializer 保存链 |

## 5. 每阶段固定产物

每个阶段不得缺少以下产物：

- 当前 program Issue、固定工作分支、umbrella change、阶段起止 commit SHA；
- 实现 diff 与架构决策记录；
- 自动化测试及原始输出；
- `validation/phases/<phase>.md` 完整运行记录；
- byte fixtures 的输入 hash、输出 hash 和差异报告；
- 真实桌面截图、录屏或可复现实验记录；
- AI 自检结论、独立 reviewer 结论、人工验收结论；
- 已知问题、风险接受人、回滚命令和 feature flag 状态；
- Go/No-Go 决定及决定人。

## 6. 共同禁止项

所有阶段都禁止：

- 从 ProseMirror、rendered DOM、widget DOM 或 serializer 取得保存正文；
- 为修复局部编辑而全文 normalize Markdown；
- 用字符串相等替代 revision、file identity 或 byte hash；
- 同一文档同时存在两个可写正文 owner；
- 自动测试失败后以人工“看起来正常”覆盖；
- 人工验收未完成却标记阶段完成；
- 只引用聊天结论而不把证据写入验证目录；
- 在日志、截图或报告中保存正文敏感数据、token、绝对私人文件内容。

## 7. 总体数据流

```text
disk bytes
   │
   ▼
LosslessDocumentSession ── confirmed revision ── prepare save ── guarded atomic bytes write/reconcile
   ▲                                  │
   │ revision-bound TextPatch         │ RenderSnapshot/IR
   │                                  ▼
CodeMirror EditorState.doc ── Decorations / Widgets / Source fallback
   │
   └── selection + composition + viewport + single History
```

Core 是持久化字节真相；CodeMirror 是低延迟交互真相。投影失败不得改变任一真相，只能降级为同一 CodeMirror 文本的 Source。
