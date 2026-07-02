## ADDED Requirements

### Requirement: OpenSpec 规范文档管理
MarkFlow SHALL use OpenSpec CLI for spec management. All specs SHALL be stored in openspec/specs/. Changes SHALL be tracked via openspec/changes/.

#### Scenario: OpenSpec 初始化
- **WHEN** 运行 `openspec init`
- **THEN** 在项目根目录创建 openspec/ 目录结构

#### Scenario: 变更提案
- **WHEN** 需要对项目做出变更
- **THEN** 使用 `openspec new change <name>` 创建变更提案

### Requirement: CodeGraph 代码知识图谱
MarkFlow SHALL use CodeGraph for code intelligence. CodeGraph SHALL pre-index all symbols, call edges, and dependencies.

#### Scenario: CodeGraph 初始化
- **WHEN** 运行 `codegraph init`
- **THEN** 在项目根目录创建 .codegraph/ 目录并构建初始代码图谱

#### Scenario: 自动同步
- **WHEN** 项目文件发生变更
- **THEN** CodeGraph 自动更新代码图谱，无需手动重新索引

## REMOVED Requirements

### Requirement: pulldown-cmark Rust 端 Markdown 解析
src-tauri/src/markdown/ SHALL be removed. pulldown-cmark was never integrated.

#### Scenario: 目录清理
- **WHEN** 检查 src-tauri/src/markdown/ 目录
- **THEN** 该目录已被删除

### Requirement: 空目录清理
src/styles/themes/ and src/styles/fonts/ SHALL be removed. Theme variables SHALL remain in variables.css.

#### Scenario: 空目录清理
- **WHEN** 检查 src/styles/themes/ 和 src/styles/fonts/
- **THEN** 两个空目录已被删除

### Requirement: QA HTML 测试文件
QA HTML files at project root SHALL be removed. qa-image.html, qa-image-actions.html, qa-image-remote-save.html, and qa-mermaid-png.html SHALL NOT be part of the build system.

#### Scenario: 废弃文件清理
- **WHEN** 更新 spec
- **THEN** 这些 QA HTML 文件已被删除
