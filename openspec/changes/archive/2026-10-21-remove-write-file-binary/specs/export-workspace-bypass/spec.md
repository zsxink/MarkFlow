# Spec Delta

## ADDED Requirements

### Requirement: 导出写盘命令必须经过授权
系统 SHALL 保证所有将文件写入磁盘的导出类 Tauri command 在写盘前获得用户授权（保存对话框），且 SHALL NOT 暴露接受前端任意指定路径并直接写盘的 command。

#### Scenario: 无任意路径写盘 command
- **WHEN** 检查已注册的导出类 Tauri command 集合
- **THEN** 其中 SHALL NOT 存在无路径校验、无保存对话框即可写任意路径的 command（如已移除的 `write_file_binary`）

#### Scenario: 二进制导出经保存对话框授权写盘
- **WHEN** 用户触发 DOCX 等二进制导出
- **THEN** 系统 SHALL 通过 `save_binary_export` 弹出保存对话框，仅在用户确认目标路径后写盘
