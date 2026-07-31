## MODIFIED Requirements

### Requirement: 导出快照
系统 SHALL 从 Core Export IR 获取结构化文档数据。导出触发时 SHALL flush 发起 session 的 pending patch，取得 confirmed revision，调用 `getExportDocument` 获取 ExportDocument，通过 IR 渲染器生成 HTML。所有导出预处理操作（图片转换、图表渲染、主题/字体处理）均在 Export IR 派生的导出文档上执行，不得读取或修改编辑器实时 DOM。M8C removal 后，产品主路径 MUST NOT 使用从编辑器 DOM 克隆创建的只读导出快照。

#### Scenario: 使用 Export IR 导出
- **WHEN** Core 会话活跃且用户触发导出
- **THEN** 系统 SHALL 使用 IR 路径而非 DOM 快照
- **AND** 通过 `buildConfirmedRevisionHtml` 获取 Export IR 并渲染

#### Scenario: Core session 缺失时失败
- **WHEN** Core 会话不可用或无法确认 revision
- **THEN** 系统 SHALL 返回稳定导出错误
- **AND** 不得从编辑器 `renderedRoot` 克隆 DOM 子树
- **AND** 文档 dirty 状态 SHALL 不变

#### Scenario: 编辑器 DOM 不受影响
- **WHEN** 导出流程使用 IR 路径
- **THEN** 编辑器的实时 DOM SHALL 保持不变
- **AND** 文档的 dirty 状态 SHALL 不变

### Requirement: 渲染 HTML 导出源
系统 SHALL 以 Core Export IR 渲染的 HTML 作为 PDF/DOCX/HTML/print 的共同内容来源。IR 路径下，Export IR 的 blocks 按类型渲染为对应 HTML 标记，包裹在 `.ProseMirror` 根容器中，携带 `data-export-ir-schema-version`、`data-session-id`、`data-revision` 属性。产品主路径 MUST NOT 从编辑器 DOM 克隆内容、读取 active editor selection，或从当前 window content 推导导出文档。

#### Scenario: IR 路径导出内容
- **WHEN** 通过 IR 路径导出含图片、图表或格式化文本的文档
- **THEN** 系统 SHALL 从 ExportDocument 的 blocks 渲染 HTML
- **AND** 不涉及编辑器 DOM 克隆

#### Scenario: 文档含本地图片
- **WHEN** 导出含本地图片（asset 协议 URL）的文档
- **THEN** 系统 SHALL 从 Export IR assets 解析本地图片并将其转换为 data URI
- **AND** 编辑器中的原始 asset URL SHALL 保持不变

#### Scenario: 源码模式下导出
- **WHEN** 用户在源码（CodeMirror）模式下触发导出
- **THEN** 系统 SHALL 先将最新源码内容同步到 Core，再通过 IR 路径构建 ExportDocument 并导出

#### Scenario: WYSIWYG 模式下导出
- **WHEN** 用户在 WYSIWYG 模式下触发导出
- **THEN** 系统 SHALL flush Core-backed editor patches 并导出发起时 confirmed revision
- **AND** 不得调用 ProseMirror serializer 或读取 WYSIWYG DOM 生成导出内容

## REMOVED Requirements

### Requirement: 克隆导出快照（fallback）
**Reason**: M8C 要求 DOM-based export 主路径删除，克隆 DOM fallback 会重新引入 active editor/window 依赖。
**Migration**: 导出工作流统一使用 `sessionId + revision + exportRequestId` 绑定的 Export IR；Core session 不可用时返回稳定错误。

### Requirement: DOM 快照路径导出内容
**Reason**: PDF/DOCX/HTML 的共同输入必须来自 confirmed revision 的 Export IR，而不是当前编辑器 DOM。
**Migration**: 图片、图表和编辑器标记清理由 Export IR renderer/export adapter 处理；历史 DOM snapshot 代码只允许保留在测试 fixture 或迁移说明中。
