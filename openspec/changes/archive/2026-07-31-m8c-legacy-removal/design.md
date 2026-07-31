## Context

M8A/M8B 已经把 Export IR、Host request context、capability negotiation、Runtime session lifecycle 和非 Tauri harness 写入主规范。当前剩余风险集中在 M8C：产品主路径仍允许 legacy fallback，包括 ProseMirror serializer 保存、WYSIWYG 整篇 serializer 同步、`getMarkdown()` save path，以及 Core session 不可用时的 DOM-based export snapshot。

M8C 的目标不是移除 WYSIWYG 编辑模式，而是移除 WYSIWYG/DOM/active window 作为文档真相或导出输入的职责。Markdown source 继续是唯一持久化真相，Source Mode 与 WYSIWYG 都必须通过 Core confirmed snapshot 保存、切换和导出。

## Goals / Non-Goals

**Goals:**

- 在观察期默认启用 Core-backed export/Host path，并让所有 legacy fallback 都显式可观测、可追踪、可删除。
- 清零 `feature-migration-matrix.md` 的 P0/P1，保证 removal PR 只做迁移收敛和旧路径删除。
- 删除产品主路径中的 ProseMirror serializer 保存链路、DOM-based export 主路径和 legacy allowlist。
- 为 removal audit、session isolation、跨平台 release smoke 和独立 agent 复核建立可重复证据。

**Non-Goals:**

- 不新增编辑功能、格式能力或插件系统。
- 不要求 PDF/DOCX adapter 全部 Rust 化。
- 不移除 WYSIWYG 编辑体验。
- 不把人工未验证的平台 smoke 写成已通过。

## Decisions

1. M8C 拆为观察期 PR 与 removal PR。

   观察期 PR 默认启用 Core-backed export/Host path，但保留 legacy fallback 作为受控应急路径。每次 fallback 必须写入结构化 marker，包含 request/session/revision/window、fallback reason、关联 issue 和用户可见错误。Removal PR 只有在观察期无 revision divergence、silent rewrite、fallback save 或错误 session 回填记录后执行。

   Alternative considered: 一次性删除旧路径。风险是无法区分新路径缺口与删除造成的回归，且不满足 M8 文档要求的稳定发布观察周期。

2. Export failure replaces DOM fallback.

   当 Core session、confirmed revision 或 Export IR 不可用时，导出返回稳定错误码，而不是克隆当前 DOM。这样可以避免导出期间切换文档、继续编辑或窗口重排导致内容来自错误 editor。

   Alternative considered: 继续保留 DOM fallback 但加 warning。warning 不能阻止静默内容污染，也会让 Host portability 仍依赖 WebView DOM。

3. Removal audit 作为 CI gate，而不是只靠代码 review。

   新增脚本或测试扫描产品主路径，禁止 `tiptap-markdown`、ProseMirror serializer save path、`getMarkdown()` save path、DOM-based export 主路径和 legacy allowlist 残留。测试 fixture、历史迁移说明和 archived OpenSpec 记录可以保留，但必须通过 allowlisted path 说明隔离。

   Alternative considered: 在 tasks/evidence 中人工记录。人工记录容易漂移，无法阻止回归。

4. WYSIWYG 保留为 Core-backed projection.

   WYSIWYG 的 DOM、decorations、widgets 和 selection 只属于 UI projection；保存、导出和模式切换统一经过 Core session/revision。旧 ProseMirror serializer API 从产品主路径删除后，WYSIWYG 仍可编辑 Markdown source。

   Alternative considered: 延后 WYSIWYG removal 到后续阶段。M8C 的验收标准要求旧 serializer 清空，延后会让 M8 无法闭环。

## Risks / Trade-offs

- Export IR 覆盖缺口导致导出失败 -> removal 前必须让 P0/P1 全绿，unsupported block 以 diagnostic/error 暴露，不静默丢内容。
- 平台 PDF/DOCX smoke 成本高 -> evidence 文件明确记录 macOS/Windows/Linux 结果；无法验证的平台标记 `未验证`，不能写作通过。
- 扫描规则误伤测试或历史文档 -> removal audit 只禁止产品主路径，允许 fixture、migration notes 和 archived change 中出现，并要求规则测试覆盖误伤样例。
- 删除 fallback 后用户遇到可恢复错误 -> UI 使用稳定错误码展示明确重试、权限或 unsupported 说明，Runtime 保持 session 状态不变。

## Migration Plan

1. 更新 delta specs，明确 M8C removal 合同。
2. 观察期 PR：默认启用 Core-backed export/Host path，fallback 仅作为显式错误/telemetry marker 路径保留；更新 feature migration matrix 和 M8C evidence。
3. 补齐自动化 coverage：session isolation、same-path multi-session、export during edit/window switch/cancel、mode switch no serializer、removal audit。
4. 独立 agent 复核并运行可执行 gate。
5. Removal PR：删除 legacy serializer 保存链路、DOM-based export 主路径和 legacy allowlist；更新 evidence。
6. 运行 PR 前通用 gate；涉及 Rust/Tauri/Host 时运行 workspace Rust gates。
7. 若 release smoke 或 audit 失败，回滚 removal PR，保留观察期 marker 并用 issue 追踪缺口。

## Open Questions

- Windows/Linux release smoke 是否有稳定本地环境，或需要在 GitHub Actions artifact/release job 中记录验证结果。
- PDF/DOCX adapter 在 removal PR 中是否直接消费 Export IR DTO，还是短期消费由 Export IR renderer 生成的结构化 HTML；两者都不能读取实时 DOM。
