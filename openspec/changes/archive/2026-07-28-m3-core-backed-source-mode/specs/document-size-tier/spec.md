## MODIFIED Requirements

### Requirement: 文档尺寸等级分类
系统 MUST 在打开前根据文件大小和行数将文档分为大小级别。

**MODIFIED**: In Core-backed Source Mode, the size class is computed by Core and returned via `DocumentOpened.sizeClass` in the Bridge protocol. The same threshold rules apply, but the classification happens server-side.

#### Scenario: Core-backed 打开返回 sizeClass
- **WHEN** Core-backed Source Mode 打开文件
- **THEN** `open_document` 返回的 `DocumentOpened` 包含 `sizeClass` 字段
- **THEN** size class 值来自 Core 的大小判断
- **THEN** UI 状态栏和 degradation bar 从该值驱动

### Requirement: UI 降级
系统 MUST 为降级模式提供清晰的 UI 指示器。

**MODIFIED**: In Core-backed Source Mode, Large/Huge documents MUST NOT trigger the ProseMirror serializer for open or save. Source Mode remains editable via CodeMirror with Core patch path, preserving full editing capability without requiring WYSIWYG mode.

#### Scenario: Core-backed Large 文档不开 ProseMirror
- **WHEN** Core-backed Source Mode 打开一个 5MB 文档
- **THEN** 不创建 ProseMirror 实例（或保持 deferred）
- **THEN** 用户可以在 Core-backed CodeMirror 中编辑和保存
- **THEN** 保存不使用 serializer，使用 Core SavePayload