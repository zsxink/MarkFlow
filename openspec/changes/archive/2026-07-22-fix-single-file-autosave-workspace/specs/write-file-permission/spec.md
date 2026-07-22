## MODIFIED Requirements

### Requirement: 文档保存使用原子写入
The `write_file` Tauri command SHALL use `atomic_write` to save document content. The command SHALL NOT reject saves based on the global workspace boundary — user-opened documents may reside outside the workspace.

#### Scenario: 工作区外文档保存成功
- **WHEN** 用户通过文件关联或打开对话框打开了工作区外的 Markdown 文件
- **AND** 调用 `write_file` 保存该文件
- **THEN** 写入应使用 `atomic_write` 成功完成
- **THEN** 不应因文件不在工作区内而拒绝

#### Scenario: 工作区内文档保存成功
- **WHEN** 调用 `write_file` 保存工作区内的 Markdown 文件
- **THEN** 写入应使用 `atomic_write` 成功完成

#### Scenario: 文档保存失败保留旧文件
- **WHEN** 调用 `write_file` 保存文件但写入失败（如磁盘已满、权限错误）
- **THEN** 原文件应保持完整且不损坏

## ADDED Requirements

### Requirement: 文件树命令保留工作区边界
文件树操作命令（`create_file`、`create_dir`、`rename_path`、`delete_path`、`copy_file`）SHALL 继续执行工作区边界检查和符号链接校验。

#### Scenario: 文件树创建被工作区外路径拒绝
- **WHEN** 调用 `create_file` 且目标路径在工作区外
- **THEN** 命令应返回错误，拒绝操作

#### Scenario: 文件树重命名被工作区外路径拒绝
- **WHEN** 调用 `rename_path` 且目标路径在工作区外
- **THEN** 命令应返回错误，拒绝操作

#### Scenario: 符号链接不被允许
- **WHEN** 调用文件树命令且路径包含符号链接
- **THEN** 命令应返回错误，拒绝操作
