## Purpose

定义 WYSIWYG 编辑器对受支持 Markdown 语法的双向保真边界，确保解析、编辑、序列化和模式切换不会静默丢失文本、结构或关键语法属性。

## ADDED Requirements

### Requirement: 完整方案 B 与 Orca 的 Markdown 核心技术栈对齐
系统 MUST 使用与 Orca 相同类别的 Markdown 核心技术栈实现完整方案 B：TipTap / ProseMirror v3、`@tiptap/markdown` 的 Marked token 模型、由统一 bridge 独占的隔离 Marked 兼容实例或门面、Markdown content type，以及自定义扩展的 tokenizer / renderer 双向契约。生产转换链路 MUST 只有一个权威 bridge，不得同时保留 v2 `tiptap-markdown`、markdown-it 转换器或业务层直接访问 `storage.markdown` 的旁路。

#### Scenario: Markdown 通过 Orca 对齐栈进入编辑器
- **WHEN** 调用方把 Markdown 加载到 WYSIWYG
- **THEN** 统一 bridge 通过 TipTap v3 Markdown content type 完成解析
- **THEN** 自定义链接、图片、列表、表格和代码块等 authored syntax 通过登记的 tokenizer / renderer hooks 保持双向契约

#### Scenario: 完整 B 使用同一安全边界
- **WHEN** 文档申请进入完整 B 的可编辑 WYSIWYG 并在保存或切换 Source 时产生候选
- **THEN** 系统依次使用资格门禁、opaque placeholder 和三方 reconcile 组成的权威安全路径
- **THEN** 任一阶段无法证明安全时降级 Source，且不得回退到第二套 Markdown 转换器生成保存候选

#### Scenario: 技术栈对齐不扩张产品范围
- **WHEN** Orca 还包含不同 UI 框架、特定 TipTap patch、数学公式、Live Preview 或自动外部修改合并能力
- **THEN** 本变更不因技术栈对齐而自动纳入这些能力
- **THEN** MarkFlow 可以保留 Tauri + 原生 TypeScript 应用壳，并使用经过本项目语料验证的 TipTap v3 patch

### Requirement: 受支持 Markdown 结构往返保真
系统 MUST 对标题、段落、强调、加粗、删除线、行内代码、链接、图片、引用、分隔线、普通列表、有序列表、任务列表、围栏代码块、GFM 表格和换行语义提供双向解析与序列化。文档经过 Markdown → WYSIWYG → Markdown 往返后 MUST 保留文本内容、节点顺序、嵌套关系和用户可观察属性。

#### Scenario: 常用行内语法往返
- **WHEN** 文档包含嵌套的强调、加粗、删除线、行内代码，以及带标题和需转义 URL 的链接
- **THEN** 往返结果保留相同的可见文本、标记范围、链接目标和链接标题

#### Scenario: 图片属性往返
- **WHEN** 文档包含带 alt、title、本地相对路径或远程 URL 的 Markdown 图片
- **THEN** 往返结果保留图片顺序、alt、title 和可持久化源地址
- **THEN** 运行时资源 URL 不得替代原始 Markdown 地址写入结果

#### Scenario: 嵌套列表往返
- **WHEN** 文档包含多层普通列表、有序列表和任务列表，并包含跨行列表项
- **THEN** 往返结果保留列表类型、层级、条目顺序、任务勾选状态和条目正文

#### Scenario: GFM 表格往返
- **WHEN** 文档包含表头、多个数据行、空单元格、行内格式和转义竖线
- **THEN** 往返结果仍为可解析的 GFM 表格
- **THEN** 单元格数量、顺序、文本与行内格式保持不变
- **THEN** 不得退化为 HTML 表格或丢弃表格内容

### Requirement: 允许的规范化不得改变语义
系统 MAY 对受支持 Markdown 执行显式列入兼容策略的格式规范化，但 MUST 保持语义等价；规范化不得更改文本、链接目标、图片地址、代码内容、列表序号语义、任务状态或表格单元格数据。

#### Scenario: 标记风格规范化
- **WHEN** 输入使用受支持但非首选的项目符号、强调分隔符或空白形式
- **THEN** 输出可以使用统一风格
- **THEN** 解析后的文档结构与用户内容必须等价

#### Scenario: 未登记的改写不被接受
- **WHEN** 往返结果与输入存在未列入兼容策略的结构或属性差异
- **THEN** 系统不得将该差异视为安全规范化
- **THEN** 文档进入对账或 Source 降级流程

#### Scenario: 两条解析路径的默认属性表示等价
- **WHEN** 编辑器解析路径与非变异校验路径仅在缺省属性、扩展运行时默认值或 mark 集合顺序上存在差异
- **THEN** 语义指纹将缺省值与等价默认值规范化为相同表示
- **THEN** 非默认表格跨度、链接目标、图片 authored attributes 和正文 mark 范围仍保持语义敏感

### Requirement: 解析与序列化失败必须显式返回
Markdown 转换 MUST 以成功结果或带阶段和原因的失败结果完成，不得用空字符串、部分文档或纯文本降级伪装成功。

#### Scenario: 解析失败
- **WHEN** 输入不能被转换为完整的 WYSIWYG 文档
- **THEN** 转换返回解析失败及可诊断原因
- **THEN** 原始 Markdown 保持不变

#### Scenario: 序列化失败
- **WHEN** 编辑器文档包含无法完整序列化的节点、标记或属性
- **THEN** 转换返回序列化失败及可诊断原因
- **THEN** 调用方不得把部分结果当作可保存 Markdown

### Requirement: 兼容语料库作为迁移门禁
系统 MUST 使用包含受支持语法、边界组合和历史回归样例的固定语料库验证 Markdown 往返。新引擎的迁移结果不得比迁移前基线新增内容丢失、结构丢失或属性丢失。

#### Scenario: 迁移基线对比
- **WHEN** 迁移前后转换器分别运行同一份固定语料库
- **THEN** 新转换器对所有承诺支持的样例满足本规范的保真要求
- **THEN** 任何有意的规范化差异均被单独登记并断言

#### Scenario: 历史缺陷回归
- **WHEN** 语料库运行表格、任务列表、链接转义、代码块尾换行、Mermaid 和 PlantUML 历史缺陷样例
- **THEN** 每个样例均产生完整且可再次解析的 Markdown
