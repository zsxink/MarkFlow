# source-layering Specification

## Purpose
定义 MarkFlow 前端与后端源码的分层目录结构、每层职责边界、允许的依赖方向、测试与生产代码的物理分离，以及这些约束的自动化门禁，使新增代码有唯一可判定的落点且重构后不会腐化。

## Requirements

### Requirement: 前端源码按层组织

前端源码 SHALL 按下表组织，每个目录只承载其职责范围内的文件：

| 目录 | 职责 |
|------|------|
| `src/types/` | 跨模块共享的类型定义，无运行时依赖 |
| `src/utils/` | 无副作用纯函数，不得 import DOM/Tauri API |
| `src/infra/` | 基础设施封装：IPC/storage、logger、错误分类、store、调度器、UI 端口 |
| `src/editor/` | 编辑器引擎与扩展（WYSIWYG、源码模式、Markdown 桥接、序列化、对账） |
| `src/render/` | 内容渲染（Mermaid、PlantUML、KaTeX、代码高亮、URL 装饰） |
| `src/export/` | 导出（HTML/DOCX/PDF、导出快照、导出主题） |
| `src/ui/` | 组件与交互（工具栏、侧边栏、文件树、对话框、右键菜单、提示条） |
| `src/main.ts` | 入口与装配 |

#### Scenario: 生产文件只出现在所属层

- **WHEN** 扫描 `src/` 下的非测试生产文件
- **THEN** 每个文件 SHALL 位于上表列出的目录之一或其子目录
- **AND** SHALL NOT 存在于已废弃的 `src/lib/`、`src/components/` 目录

#### Scenario: 已废弃目录不得复活

- **WHEN** 生产文件出现在 `src/lib/` 或 `src/components/`
- **THEN** 校验脚本 SHALL 以 `forbidden-dir` 规则失败
- **AND** 文件 SHALL 被移入对应的层目录，而不是让校验器把旧目录名映射成层

#### Scenario: 顶层目录必须是已声明的层

- **WHEN** `src/` 下出现规范未声明的顶层目录
- **THEN** 校验脚本 SHALL 以 `unknown-dir` 规则失败并列出允许的目录
- **AND** 虚拟层带名（如 `engine`）SHALL NOT 被当作真实目录接受

#### Scenario: 入口之外的装配集中在 main

- **WHEN** 检查应用启动装配（UI 端口注册、编辑器初始化、全局事件绑定）
- **THEN** 装配代码 SHALL 位于 `src/main.ts` 或其直接调用的装配模块
- **AND** 业务模块 SHALL NOT 在模块顶层执行装配副作用

### Requirement: 依赖方向单向且可校验

前端依赖 SHALL 严格单向：`types ← utils ← infra ← editor/render/export ← ui ← main`。每一层 MAY import 左侧任意层，SHALL NOT import 右侧层。

#### Scenario: 基础设施层不反向依赖 UI

- **WHEN** 检查 `src/infra/`、`src/utils/`、`src/types/` 的 import
- **THEN** 不存在指向 `src/ui/` 的 import
- **AND** 不存在指向 `src/main.ts` 的 import

#### Scenario: 引擎层不反向依赖 UI

- **WHEN** 检查 `src/editor/`、`src/render/`、`src/export/` 的 import
- **THEN** 不存在指向 `src/ui/` 的 import
- **AND** 需要 UI 能力（提示、右键菜单、面板刷新、降级条、会话确认、打开文档）时 SHALL 通过注入的回调端口取得，而不是直接 import

#### Scenario: 模块间无循环依赖

- **WHEN** 对 `src/` 生产文件构建 import 图并做连通分量分析
- **THEN** 不存在包含两个及以上文件的强连通分量

#### Scenario: 不存在跨层深穿 import

- **WHEN** 检查任意生产文件的相对 import 路径
- **THEN** SHALL NOT 出现三层及以上的向上穿越（如 `../../../`）
- **AND** 跨层引用 SHALL 经目标层入口模块或 barrel 完成

### Requirement: 模块对外暴露唯一入口

`src/editor/`、`src/render/`、`src/export/` SHALL 各自提供 `index.ts` 作为对外 barrel，模块外代码 SHALL 只从 barrel 导入。

#### Scenario: 外部代码经 barrel 访问模块

- **WHEN** 检查 `src/ui/`、`src/main.ts` 对 `src/editor/`、`src/render/`、`src/export/` 的 import
- **THEN** import 目标 SHALL 为对应目录的 `index.ts`
- **AND** SHALL NOT 直接 import 模块内部实现文件

#### Scenario: 模块内部文件不互相穿越

- **WHEN** 检查 `src/editor/` 内部文件之间的 import
- **THEN** SHALL 仅引用同目录或子目录文件
- **AND** SHALL NOT 引用其他层的内部实现文件

### Requirement: UI 能力通过端口注入

跨层协作所需的 UI 能力 SHALL 以类型化端口形式定义在 `src/infra/ui-ports.ts`，由 `src/main.ts` 在启动时注册实现。端口至少覆盖：提示消息、确认/保存对话框、文档打开、图表与表格右键菜单、frontmatter 面板刷新、降级条显隐。

#### Scenario: 端口未注册时的降级行为

- **WHEN** 端口实现尚未注册而被调用
- **THEN** 调用 SHALL 记录结构化 warn 日志并安全跳过，不得抛出未捕获异常

#### Scenario: 端口注册后行为与直接调用一致

- **WHEN** 端口实现已注册
- **THEN** 触发该端口的用户可见行为（提示文案、对话框、菜单）SHALL 与迁移前一致

### Requirement: 测试代码与生产代码物理分离

测试文件 SHALL 存放在与被测模块镜像的 `__tests__/` 目录下，仅测试使用的 fixture/helper SHALL 存放在 `src/__fixtures__/`。

#### Scenario: 生产目录不含测试文件

- **WHEN** 扫描 `src/` 下所有生产目录
- **THEN** SHALL NOT 存在 `*.test.ts`
- **AND** SHALL NOT 存在仅测试使用的 `*.fixtures.ts` 或 `*.helpers.ts`

#### Scenario: 测试仍被测试运行器收集

- **WHEN** 执行 `npm test`
- **THEN** `vitest` 的 `include` 配置 SHALL 覆盖 `src/**/__tests__/**/*.test.ts`
- **AND** 迁移后的测试数量与迁移前一致，且全部通过

#### Scenario: 依赖路径读取的测试保持可定位仓库根

- **WHEN** 测试需要读取仓库内文件（如 OpenSpec 规范、脚本、样式表）
- **THEN** SHALL 以仓库根为基准解析路径，不得依赖测试文件自身所在层级

### Requirement: 后端源码按子域与基础设施分层

`src-tauri/src/` SHALL 按职责分层：基础设施模块（`net/`、`fs/`、`config/`、`error`、`logger`、`state`、`paths`）与命令层（`commands/<子域>/`）分离，命令文件 SHALL 按子域拆分而不是按行数堆积。

#### Scenario: 命令按子域组织

- **WHEN** 检查 `src-tauri/src/commands/`
- **THEN** 每个子域 SHALL 拥有独立目录（至少覆盖文件、图片、导出、设置）
- **AND** 单个命令文件 SHALL NOT 同时承担路径安全、原子写、文件树、CRUD 与导出对话框职责

#### Scenario: 网络与路径基础设施独立

- **WHEN** 检查网络请求与路径安全实现
- **THEN** URL 校验、DNS 解析、重定向校验、magic number 校验、日志脱敏 SHALL 位于 `net/` 下的独立模块
- **AND** 路径解析与原子写 SHALL 位于 `fs/` 下的独立模块

#### Scenario: 后端测试文件不计入生产预算

- **WHEN** 校验 `src-tauri/src/` 的文件行数与测试分离
- **THEN** `<module>/tests.rs` 与 `src-tauri/tests/` 下的文件 SHALL 按测试代码统计
- **AND** SHALL NOT 计入生产文件数量，也 SHALL NOT 受生产文件行数上限约束

#### Scenario: 后端生产文件不含测试模块

- **WHEN** 扫描 `src-tauri/src/` 下的生产文件
- **THEN** SHALL NOT 存在内联 `#[cfg(test)] mod tests`
- **AND** 单元测试 SHALL 位于同目录的 `tests/` 子模块文件，并以 `#[cfg(test)] mod tests;` 声明

### Requirement: 规范与门禁保持同步

分层、文件行数与测试分离约束 SHALL 由自动化脚本校验，并在 CI 中作为失败门禁执行。

#### Scenario: 分层校验拦截违规

- **WHEN** 生产代码出现跨层反向 import、循环依赖或深穿 import
- **THEN** 校验脚本 SHALL 以非零退出码失败并列出违规文件与 import 语句

#### Scenario: 文件行数校验拦截超限

- **WHEN** `src/` 或 `src-tauri/src/` 下任一生产文件超过 900 行
- **THEN** 校验脚本 SHALL 失败并输出该文件路径与行数

#### Scenario: 测试分离校验拦截混入

- **WHEN** 生产目录出现 `*.test.ts` 或生产 `.rs` 文件出现内联 `#[cfg(test)] mod tests`
- **THEN** 校验脚本 SHALL 失败并列出违规文件

#### Scenario: 规范文档可被 OpenSpec 校验

- **WHEN** 执行 `npm run validate:openspec`
- **THEN** 分层与代码规范 SHALL 以 `openspec/specs/` 下的正式规范存在并被 `INDEX.md` 索引
- **AND** SHALL NOT 仅存在于 `docs/archive/` 等归档目录
