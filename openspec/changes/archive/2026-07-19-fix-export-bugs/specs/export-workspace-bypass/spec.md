## ADDED Requirements

### Requirement: Export writes bypass workspace validation
系统 SHALL 提供专用的导出写入命令，允许用户将导出文件保存到任意位置，不受工作区路径限制。

#### Scenario: 用户导出到工作区外路径
- **WHEN** 用户在保存对话框中选择工作区外的路径（如桌面、下载目录）
- **THEN** 系统 SHALL 成功写入文件到该路径

#### Scenario: 用户取消导出保存
- **WHEN** 用户关闭或取消导出的保存对话框
- **THEN** 系统 SHALL 不写入任何文件且不显示错误

#### Scenario: 导出写入失败
- **WHEN** 目标路径不可写或磁盘空间不足
- **THEN** 系统 SHALL 显示用户可理解的导出失败提示
