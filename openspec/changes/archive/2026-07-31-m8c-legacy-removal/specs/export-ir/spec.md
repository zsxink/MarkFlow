## MODIFIED Requirements

### Requirement: 前端 Export IR 渲染
前端 SHALL 通过 `exportIrRenderer.ts` 将 ExportDocument 中的 blocks 渲染为 HTML 字符串。渲染器 SHALL 按顺序处理每个块，根据 `ExportBlockKind` 类型生成对应的 HTML 标记。前端 `documentExport.ts` SHALL 将 IR 渲染的 HTML 嵌入完整导出文档（含样式和字体声明）。M8C removal 后，产品主路径 MUST NOT 因 Core 会话不可用、sessionId 缺失或 revision 不可确认而回退到当前编辑器 DOM；系统 SHALL 返回稳定导出错误并保持文档状态不变。

#### Scenario: IR 渲染优先
- **WHEN** Core 会话活跃且导出触发
- **THEN** 前端 SHALL 先 flush CoreSession
- **AND** 调用 `getExportDocument` 获取 Export IR
- **AND** 通过 `renderExportIrToHtmlContent` 渲染为 HTML
- **AND** 导出此 HTML

#### Scenario: Core 会话缺失不回退 DOM
- **WHEN** 导出触发但 Core 会话不可用、没有 sessionId 或 revision 不可确认
- **THEN** 前端 SHALL 返回稳定导出错误
- **AND** 不得克隆或读取当前编辑器 DOM 作为导出内容
- **AND** 不得报告导出成功

#### Scenario: 诊断信息记录
- **WHEN** ExportDocument 包含 diagnostics
- **THEN** 系统 SHALL 在日志中输出诊断信息（代码、消息、block_id）
- **AND** 不阻塞导出流程，除非目标 adapter 声明该 diagnostic 为失败级别

#### Scenario: IR 响应校验
- **WHEN** 前端收到 ExportDocument
- **THEN** SHALL 验证 `session_id`、`base_revision`、`export_request_id` 与请求一致
- **AND** 不一致时抛出 `EXPORT_SESSION_MISMATCH` 错误

## REMOVED Requirements

### Requirement: DOM 快照 fallback
**Reason**: M8C 删除实时编辑 DOM 作为导出真相，避免切换文档、继续编辑或 active window 回填导致导出错误内容。
**Migration**: 使用 Core confirmed revision 构建 Export IR；若 Core session/revision 不可用，返回稳定导出错误并写入 M8C evidence，而不是导出当前 DOM。
