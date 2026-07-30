# rendered-document-export Specification

## MODIFIED Requirements

### Requirement: 导出快照
系统 SHALL 优先从 Core Export IR 获取结构化文档数据。当 Core 会话活跃时，SHALL 调用 `getExportDocument` 获取 ExportDocument，通过 IR 渲染器生成 HTML。当 Core 会话不可用时，SHALL 回退到从编辑器 DOM 克隆创建只读导出快照。所有导出预处理操作（图片转换、编辑器标记清理）均在 IR 渲染或克隆 DOM 上执行，不得修改编辑器实时状态。

**FROM:** 系统 SHALL 在导出前从编辑器 DOM 克隆创建只读导出快照，所有导出预处理操作（图片转换、编辑器标记清理）均在克隆上执行，不得修改编辑器实时 DOM。

**TO:** 系统 SHALL 优先从 Core Export IR 获取结构化文档数据。当 Core 会话活跃时，SHALL 调用 `getExportDocument` 获取 ExportDocument，通过 IR 渲染器生成 HTML。当 Core 会话不可用时，SHALL 回退到从编辑器 DOM 克隆创建只读导出快照。所有导出预处理操作均在 IR 渲染或克隆 DOM 上执行，不得修改编辑器实时 DOM。

#### Scenario: 使用 Export IR 导出
- **WHEN** Core 会话活跃且用户触发导出
- **THEN** 系统 SHALL 使用 IR 路径而非 DOM 快照
- **AND** 通过 `buildConfirmedRevisionHtml` 获取 Export IR 并渲染

#### Scenario: 克隆导出快照（fallback）
- **WHEN** Core 会话不可用
- **THEN** 系统 SHALL 从编辑器 `renderedRoot` 克隆 DOM 子树
- **AND** 所有预处理操作在克隆 DOM 上执行

#### Scenario: 编辑器 DOM 不受影响
- **WHEN** 导出流程使用 IR 路径或 DOM 快照
- **THEN** 编辑器的实时 DOM SHALL 保持不变
- **AND** 文档的 dirty 状态 SHALL 不变

#### Scenario: 清理编辑器标记
- **WHEN** 系统使用 DOM 快照路径
- **THEN** SHALL 移除 `contenteditable`、`draggable`、NodeView 控件和编辑器专用 CSS 类名

### Requirement: 渲染 HTML 导出源
系统 SHALL 以 Core Export IR 渲染的 HTML（IR 路径）或 WYSIWYG 编辑器的渲染 HTML（DOM 快照路径）为三种导出（PDF/DOCX/HTML）的共同内容来源。IR 路径下，Export IR 的 blocks 按类型渲染为对应 HTML 标记，包裹在 `.ProseMirror` 根容器中，携带 `data-export-ir-schema-version`、`data-session-id`、`data-revision` 属性。DOM 快照路径下，SHALL 从编辑器 DOM 克隆创建只读快照，在克隆上执行图片转换、编辑器标记清理和图表渲染，所有预处理不得修改编辑器实时 DOM。

**FROM:** 系统 SHALL 以当前 WYSIWYG 编辑器的渲染 HTML 为三种导出的共同内容来源。导出前 SHALL 从编辑器 DOM 克隆创建只读快照，在克隆上执行图片转换、编辑器标记清理和图表渲染，所有预处理不得修改编辑器实时 DOM。

**TO:** 系统 SHALL 以 Core Export IR 渲染的 HTML（IR 路径）或 WYSIWYG 编辑器的渲染 HTML（DOM 快照路径）为三种导出（PDF/DOCX/HTML）的共同内容来源。IR 路径下，Export IR 的 blocks 按类型渲染为对应 HTML 标记，包裹在 `.ProseMirror` 根容器中，携带 `data-export-ir-schema-version`、`data-session-id`、`data-revision` 属性。DOM 快照路径下，SHALL 从编辑器 DOM 克隆创建只读快照，在克隆上执行图片转换、编辑器标记清理和图表渲染，所有预处理不得修改编辑器实时 DOM。

#### Scenario: IR 路径导出内容
- **WHEN** 通过 IR 路径导出含图片、图表或格式化文本的文档
- **THEN** 系统 SHALL 从 ExportDocument 的 blocks 渲染 HTML
- **AND** 不涉及编辑器 DOM 克隆

#### Scenario: DOM 快照路径导出内容
- **WHEN** 通过 DOM 快照路径导出
- **THEN** 系统 SHALL 从编辑器 DOM 克隆子树的只读快照
- **AND** 在快照上执行图片转换和图表处理

#### Scenario: 文档含本地图片
- **WHEN** 导出含本地图片（asset 协议 URL）的文档
- **THEN** 系统 SHALL 在导出快照上将 asset URL 转换为 data URI
- **AND** 编辑器中的原始 asset URL SHALL 保持不变

#### Scenario: 源码模式下导出
- **WHEN** 用户在源码（CodeMirror）模式下触发导出
- **THEN** 系统 SHALL 先将最新源码内容同步到 Core，再通过 IR 路径构建 ExportDocument 并导出

## ADDED Requirements

### Requirement: IR 导出会话一致性校验
当使用 Export IR 路径时，系统 SHALL 校验 ExportDocument 的 session_id、base_revision、export_request_id 与原始请求一致，确保导出内容与当前文档状态对应。

#### Scenario: 会话校验通过
- **WHEN** 前端收到 ExportDocument
- **THEN** SHALL 校验 session_id 与请求一致
- **AND** SHALL 校验 base_revision 与 flush 后的 revision 一致
- **AND** SHALL 校验 export_request_id 与请求一致

#### Scenario: 会话校验失败
- **WHEN** 任意校验不通过
- **THEN** 系统 SHALL 抛出 `EXPORT_SESSION_MISMATCH` 错误
- **AND** 不生成导出输出
