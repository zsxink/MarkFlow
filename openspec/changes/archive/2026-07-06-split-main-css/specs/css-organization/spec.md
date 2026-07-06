## ADDED Requirements

### Requirement: CSS 按组件拆分
系统 SHALL 将 `main.css` 中的样式按功能域拆分到独立文件，便于维护和定位。

#### Scenario: 拆分后文件结构正确
- **WHEN** 开发者在 `src/styles/` 目录查看文件
- **THEN** 应存在 `app.css`、`toolbar.css`、`sidebar.css`、`editor.css`、`components.css`，且 `main.css` 已被删除

#### Scenario: 拆分后样式无回归
- **WHEN** 应用加载所有 CSS 文件
- **THEN** 应用渲染结果与拆分前完全一致（选择器优先级不变，样式值不变）

#### Scenario: main.ts 导入正确
- **WHEN** 查看 `src/main.ts` 的 import 语句
- **THEN** 应包含各 CSS 文件的 import，且不包含 `main.css` 的引用

### Requirement: 文件职责清晰
每个 CSS 文件 SHALL 只包含其对应组件的样式，不跨文件重复定义选择器。

#### Scenario: 无跨文件选择器冲突
- **WHEN** 任意选择器在拆分后的文件中被定义
- **THEN** 该选择器不应在另一个拆分文件中重复出现（除非是全局 reset）

#### Scenario: 文件行数合理
- **WHEN** 统计各 CSS 文件行数
- **THEN** 每个文件不超过 400 行（variables.css 除外）
