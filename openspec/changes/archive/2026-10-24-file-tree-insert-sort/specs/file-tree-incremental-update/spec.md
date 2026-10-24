# Spec Delta

## ADDED Requirements

### Requirement: 增量插入排序一致性

文件树 DOM 增量插入（watcher 事件、新建、重命名重排、分页追加、拖拽落树）SHALL 保持与全量刷新一致的排序：文件夹整体位于文件之上，同类内按名称 `localeCompare` 升序。插入位置 SHALL 由统一的排序插入 helper 决定，不得在找不到更大名称的同类节点时把文件夹落到文件之后或分页按钮之后。

#### Scenario: 新文件夹名排在所有已有文件夹之后

- **WHEN** 工作区已渲染 `archive/`、`notes/` 文件夹与若干文件节点，外部新增（或内部新建）名称排序在其后的文件夹（如「测试」）
- **THEN** 该文件夹节点 SHALL 插入到文件夹区末尾（最后一个文件夹之后、第一个文件节点之前），不落到任何文件之下

#### Scenario: 新文件名排在所有已有文件之后

- **WHEN** 增量插入一个名称排在所有已有文件之后的文件节点
- **THEN** 该文件节点 SHALL 落到文件区末尾；若容器存在 `.tree-load-more` 分页按钮，SHALL 插到按钮之前

#### Scenario: 重命名到排序末位的名称

- **WHEN** inline 重命名文件或跨目录重命名后，节点新名称在同类中排最后
- **THEN** 重排后节点位置 SHALL 与全量刷新后的位置一致，文件夹仍整体在文件之上

#### Scenario: 增量插入顺序与全量刷新一致

- **WHEN** 任一增量插入路径（watcher create、右键复制副本、新建对话框、拖拽移动、分页追加）执行后立即触发 `refreshFileTree()` 全量刷新
- **THEN** 刷新前后同级节点的顺序 SHALL 相同
