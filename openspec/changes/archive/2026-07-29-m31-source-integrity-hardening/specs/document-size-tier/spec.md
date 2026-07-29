# document-size-tier Specification (Delta for M3.1)

## MODIFIED Requirements

### Requirement: 文档尺寸等级分类（修改 — Core 实际字节）

在 Core-backed Source Mode 下，size class SHALL 由 Core 根据实际源字节长度（而非逻辑文本长度）计算，通过 `DocumentOpened.sizeClass` 返回。

#### Scenario: Core-backed 打开返回 sizeClass（增强）

- **WHEN** Core-backed Source Mode 打开文件
- **THEN** `open_document` 返回的 `DocumentOpened` 包含 `sizeClass` 字段
- **THEN** size class 基于 Core 保存的实际源字节数分类
- **THEN** size class 值与 legacy 路径一致（仅字节来源不同）
- **THEN** UI 状态栏和 degradation bar 从该值驱动
