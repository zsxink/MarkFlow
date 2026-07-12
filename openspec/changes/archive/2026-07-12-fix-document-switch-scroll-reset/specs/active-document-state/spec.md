## MODIFIED Requirements

### Requirement: setActiveFilePath 更新 store 并同步 DOM
WHEN 调用 `setActiveFilePath(path)`
THEN `store` 中的 `activeFilePath` SHALL 被设置为 `path`
THEN 文件树中路径匹配的节点 SHALL 被高亮为 active
THEN 文件树中其他节点 SHALL 移除 active 高亮

#### Scenario: 文档切换时滚动位置重置
- **WHEN** 调用 `openFileInEditor` 打开一个与当前不同的文档
- **THEN** editor-area 滚动容器的 scrollTop SHALL 被重置为 0

#### Scenario: 重新加载文档时保持滚动位置
- **WHEN** 调用 `reloadActiveDocumentFromDisk` 重新加载当前文档
- **THEN** editor-area 滚动容器的 scrollTop SHALL 保持不变
