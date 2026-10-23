# Spec Delta

## Purpose

定义 MarkFlow 全部代码（TypeScript 与 Rust）的硬性工程规范：文件大小、命名、注释、错误处理、去重、安全、文档分级，以及本项目允许与禁止的设计模式，作为唯一权威源被 CI 与评审引用。

## ADDED Requirements

### Requirement: 文件大小上限

单个生产源码文件 SHALL 不超过 900 行；目标 SHALL 为 500 行以内。

#### Scenario: 超限文件必须按职责拆分

- **WHEN** 生产文件超过 900 行
- **THEN** SHALL 按职责/生命周期拆分，SHALL NOT 按行数硬切
- **AND** 拆分后各文件 SHALL 低于上限

#### Scenario: 承载数据表的文件例外需说明

- **WHEN** 某文件因承载数据表、枚举或映射而超出 500 行
- **THEN** SHALL 在文件头部注释说明超限原因
- **AND** SHALL 仍不超过 900 行

#### Scenario: 超过 400 行进入观察区

- **WHEN** 生产文件超过 400 行
- **THEN** 新增改动 SHALL 评估是否应拆分，不得继续无边界追加职责

### Requirement: 命名规范

文件名与标识符 SHALL 遵循统一命名规则，导出面 SHALL 仅包含真实的跨模块公共 API。

#### Scenario: TypeScript 命名

- **WHEN** 新增 TypeScript 文件或符号
- **THEN** 文件名 SHALL 为小写短横线（如 `file-tree.core.ts`）
- **AND** 组件/类 SHALL 为 `PascalCase`，函数/变量 SHALL 为 `camelCase`，常量 SHALL 为 `UPPER_SNAKE`

#### Scenario: Rust 命名

- **WHEN** 新增 Rust 文件或符号
- **THEN** 文件名与函数 SHALL 为 `snake_case`，结构体/枚举 SHALL 为 `PascalCase`，常量 SHALL 为 `SCREAMING_SNAKE`

#### Scenario: 不导出仅内部使用的符号

- **WHEN** 某符号只在定义文件或同模块内使用
- **THEN** SHALL NOT 被 `export` / `pub` 暴露为公共 API

### Requirement: 错误处理规范

错误处理 SHALL 结构化且可分类，生产路径 SHALL NOT 因可预期失败而 panic 或静默吞错。

#### Scenario: 后端错误带稳定分类

- **WHEN** Rust 命令失败
- **THEN** SHALL 返回统一错误类型，携带稳定错误码与可读消息
- **AND** SHALL NOT 以裸字符串作为唯一错误信息

#### Scenario: 非测试生产路径不 panic

- **WHEN** 检查 `src-tauri/src` 的生产路径（排除测试模块）
- **THEN** SHALL NOT 存在 `unwrap()` / `expect()` / `unreachable!()` 用于可能失败的常规路径
- **AND** 可恢复的共享状态 SHALL 经统一锁助手恢复

#### Scenario: 前端不静默丢弃错误

- **WHEN** 前端 `catch` 捕获错误
- **THEN** SHALL 经统一分类上报，或对显式 best-effort 操作记录结构化 `debug`/`warn` 日志
- **AND** SHALL NOT 出现无分类、无日志的空捕获

### Requirement: 安全硬性约定

所有写盘与外部输入处理 SHALL 经过统一的校验助手，不得散落手抄。

#### Scenario: 写盘路径统一校验

- **WHEN** 任何命令写入文件
- **THEN** SHALL 经过工作区校验与大小上限检查
- **AND** SHALL 使用统一的原子写助手（临时文件 + 落盘 + rename）

#### Scenario: 远程抓取统一防护

- **WHEN** 代码发起外部 HTTP 请求
- **THEN** SHALL 复用统一 URL 校验、DNS/IP 校验、重定向校验与响应类型校验
- **AND** 日志 SHALL 使用脱敏后的 URL

#### Scenario: 消毒与 unsafe 约束

- **WHEN** 渲染外部 HTML/SVG 或使用 `unsafe` Rust
- **THEN** 消毒 SHALL 复用公共 helper
- **AND** 每处 `unsafe` SHALL 附 `// SAFETY:` 说明，能避免时 SHALL 优先改用安全替代

### Requirement: 去重约定

同一逻辑 SHALL 只实现一次；出现第三处相同逻辑时 SHALL 抽取公共助手。

#### Scenario: 第三次重复触发抽取

- **WHEN** 同一段逻辑在代码库中出现第三处
- **THEN** SHALL 抽到共享模块并被所有调用点复用

#### Scenario: 新增相似代码前先检索

- **WHEN** 新增功能需要实现与既有代码相似的处理
- **THEN** SHALL 先检索是否已有可复用助手，而不是直接复制

### Requirement: 注释与死代码

注释 SHALL 解释「为什么」而非「是什么」；死代码 SHALL 被删除而不是被抑制。

#### Scenario: 注释只解释意图

- **WHEN** 添加注释
- **THEN** SHALL 说明取舍、约束或非显然的原因
- **AND** SHALL NOT 叙述已删除代码的历史或用注释重复代码语义

#### Scenario: 不以允许属性掩盖死代码

- **WHEN** 某符号未被使用
- **THEN** SHALL 删除或真正接入调用链
- **AND** SHALL NOT 以 `#[allow(dead_code)]` 等属性长期掩盖

### Requirement: 设计模式约定

代码 SHALL 遵循本项目固定的设计模式约定，明确允许与禁止的写法。

#### Scenario: 分层依赖单向

- **WHEN** 新增跨层调用
- **THEN** 依赖方向 SHALL 为 `types ← utils ← infra ← editor/render/export ← ui ← main`
- **AND** 引擎/渲染/导出层需要 UI 能力时 SHALL 走回调注入

#### Scenario: facade 加内部模块

- **WHEN** 某模块对外暴露能力
- **THEN** SHALL 通过唯一 barrel/facade 暴露
- **AND** 外部代码 SHALL NOT 绕过 barrel 直连内部实现文件

#### Scenario: 状态单真相

- **WHEN** 多个模块需要同一份状态
- **THEN** SHALL 由消费方直接导入该状态的唯一定义
- **AND** SHALL NOT 通过 UI 组件中转再导出，SHALL NOT 为同一概念保留两套 accessor

#### Scenario: 依赖注入优先于全局单例

- **WHEN** 模块之间需要协作
- **THEN** SHALL 通过参数、回调或端口注入
- **AND** SHALL NOT 新增模块级可变全局状态

#### Scenario: 纯函数下沉

- **WHEN** 某逻辑无副作用且需要单测
- **THEN** SHALL 放入 `src/utils/`
- **AND** 该文件 SHALL NOT import DOM 或 Tauri API

#### Scenario: 禁止的写法

- **WHEN** 提交的代码出现循环依赖、分层倒置、三层及以上深穿 import、仅本文件使用却 `export` 的符号、非测试路径 `unwrap()`/`expect()`、或以属性掩盖死代码
- **THEN** 评审 SHALL 拒绝，CI 校验 SHALL 失败

### Requirement: 文档分级

文档 SHALL 按类型分级存放，唯一权威规范 SHALL 位于 `openspec/specs/`。

#### Scenario: 规范只在 OpenSpec 主规范

- **WHEN** 某文档声明为规范或唯一权威源
- **THEN** SHALL 位于 `openspec/specs/` 并在 `INDEX.md` 登记
- **AND** SHALL NOT 仅存在于 `docs/` 或归档目录

#### Scenario: 知识与一次性产物标注类型

- **WHEN** 文档属于排障经验或一次性验收报告
- **THEN** 文件头部 SHALL 标注「非规范」或「历史记录」并注明复跑命令
- **AND** 可再生的快照产物 SHALL NOT 入库

#### Scenario: 废弃方案显式标记

- **WHEN** 某方案已放弃
- **THEN** 文档 SHALL 标注废弃或归档，SHALL NOT 继续以「待实施」面貌存在
