## ADDED Requirements

### Requirement: 真实 Tauri 桌面测试入口
项目 SHALL 提供基于 WebdriverIO、`@wdio/tauri-service` 和 embedded provider 的独立 E2E 命令，以自动构建并驱动真实 MarkFlow Tauri 窗口。该命令 MUST 与 `npm test` 分离，且 MUST 能在受支持的 macOS 开发机和 Linux CI 环境中无人工点击运行。

#### Scenario: 开发者运行桌面冒烟测试
- **WHEN** 开发者在满足依赖的 macOS 或 Linux 环境执行 E2E 冒烟命令
- **THEN** 命令 SHALL 构建测试专用 Tauri 二进制并启动真实 MarkFlow 窗口
- **THEN** WebdriverIO SHALL 连接窗口并完成冒烟用例后自动退出

#### Scenario: 单元测试保持快速独立
- **WHEN** 开发者执行 `npm test`
- **THEN** Vitest SHALL 在不构建或启动 Tauri 桌面二进制的情况下运行
- **THEN** E2E 开发依赖 SHALL NOT 改变现有单元测试的语义

### Requirement: 测试能力与生产构建隔离
WDIO Rust 插件、前端 guest plugin 和测试权限 MUST 只在显式 E2E 构建特性与配置下启用。普通开发或 release 构建 MUST NOT 注册 WDIO execute、mock、日志桥接或 embedded WebDriver server，也 MUST NOT 授予对应 capability。

#### Scenario: 构建 E2E 二进制
- **WHEN** 构建命令显式启用 E2E Cargo feature、Vite mode 和 Tauri 配置
- **THEN** 二进制 SHALL 注册 embedded WebDriver 与 WDIO Tauri 插件
- **THEN** 主窗口 SHALL 仅在该构建中获得执行测试所需的 WDIO 权限

#### Scenario: 构建发布二进制
- **WHEN** 执行普通 MarkFlow release 构建
- **THEN** 构建产物 SHALL NOT 注册或暴露任何 WDIO 插件命令与 WebDriver server
- **THEN** 生效的 capability 集合 SHALL NOT 包含 WDIO 测试权限

### Requirement: 测试数据强隔离
每次 E2E 运行 MUST 使用唯一临时运行根目录，包含独立的应用配置、日志、工作区和文档夹具。启用 E2E feature 的应用 MUST 要求有效的绝对测试数据根；该值缺失或无效时 MUST 拒绝启动，并且 MUST NOT 回退到平台默认 MarkFlow 配置目录。

#### Scenario: 使用有效临时根启动
- **WHEN** 测试运行器创建唯一临时目录并将其传给 E2E 构建
- **THEN** 设置、应用日志、工作区与测试文档 SHALL 全部位于该运行根或其明确的产物副本内
- **THEN** 测试读写 SHALL NOT 触碰用户真实 MarkFlow 配置或文档

#### Scenario: 隔离配置缺失时失败关闭
- **WHEN** E2E 二进制启动时没有有效的绝对测试数据根
- **THEN** 应用 SHALL 在读写任何平台默认 MarkFlow 数据之前失败
- **THEN** 错误日志 SHALL 明确指出隔离配置无效

#### Scenario: 测试完成后清理
- **WHEN** E2E 运行成功、失败或被取消
- **THEN** 运行器 SHALL 先终止被测应用，再清理临时工作区与配置
- **THEN** 失败诊断产物 SHALL 在清理前复制到受控产物目录

### Requirement: 显式应用就绪协议
应用 SHALL 在编辑器初始化、设置加载、初始文件或工作区恢复和必要事件监听完成后暴露稳定的可观察就绪状态。E2E 用例 MUST 等待该状态及目标控件可交互，且 MUST NOT 使用固定时间睡眠作为应用就绪条件。

#### Scenario: 启动成功后标记就绪
- **WHEN** 应用完成所有必需启动步骤
- **THEN** `#app` SHALL 暴露 `data-app-ready="true"`
- **THEN** 编辑器和当前工作区界面 SHALL 已可接受测试交互

#### Scenario: 启动失败不产生假就绪
- **WHEN** 必需的编辑器初始化或隔离数据加载失败
- **THEN** 应用 SHALL NOT 暴露成功就绪标记
- **THEN** 前端或后端日志 SHALL 包含可诊断的失败上下文

### Requirement: 稳定且语义化的元素定位
E2E 测试 SHALL 优先使用可访问 role/name、稳定元素 id 和必要的 `data-testid`，动态文件树节点 SHALL 可通过 role 与规范化路径稳定识别。测试 MUST NOT 依赖屏幕坐标、样式 class、易变 DOM 层级或固定延时。

#### Scenario: 定位核心交互控件
- **WHEN** 测试定位编辑器模式按钮、保存按钮、设置控件或文件树节点
- **THEN** 定位器 SHALL 表达用户可感知语义或稳定业务身份
- **THEN** 仅改变视觉样式或非语义 DOM 包装 SHALL NOT 破坏测试

#### Scenario: 等待异步结果
- **WHEN** 用户动作触发保存、模式切换、文件树更新或 toast
- **THEN** 测试 SHALL 等待可观察的最终状态并设置有界超时
- **THEN** 测试 SHALL NOT 通过重复有副作用的用户动作掩盖竞态

### Requirement: 核心桌面用户路径覆盖
桌面 E2E 套件 MUST 至少覆盖应用启动、Markdown 编辑与工具栏格式化、WYSIWYG/源码模式内容往返、保存后重新打开、文件树新建/重命名/删除以及代表性设置持久化。成功路径 SHALL 使用真实 Tauri command 和临时磁盘数据验证跨层行为。

#### Scenario: 编辑和模式往返保持内容
- **WHEN** 用户在 WYSIWYG 编辑器输入 Markdown 内容、应用一种工具栏格式并切换到源码模式再返回
- **THEN** 两种模式 SHALL 显示语义等价的内容和格式
- **THEN** 模式指示器与活动按钮 SHALL 反映当前模式

#### Scenario: 保存后重新打开文档
- **WHEN** 用户修改临时工作区文档、显式保存并通过界面重新打开该文档
- **THEN** 重新打开的编辑器 SHALL 显示已保存内容
- **THEN** 临时磁盘文件 SHALL 包含相同的持久化结果

#### Scenario: 管理文件树条目
- **WHEN** 用户通过文件树依次新建、重命名和删除测试条目
- **THEN** 文件树 SHALL 在每一步显示与操作一致的节点状态
- **THEN** 临时工作区磁盘状态 SHALL 与最终界面状态一致

#### Scenario: 设置跨重启持久化
- **WHEN** 用户修改一个代表性设置、关闭应用并以相同隔离数据根重新启动
- **THEN** 设置界面和受影响的应用行为 SHALL 恢复已保存值
- **THEN** 真实用户设置 SHALL 保持不变

### Requirement: 原生交互与异常路径分类
系统文件选择器等不适合稳定自动点击的原生 UI SHALL 在 Tauri IPC 边界使用可恢复 mock 验证前端行为。套件 MUST 区分真实后端、mock 和发布前人工覆盖；保存/重开等核心持久化路径 MUST NOT 只由 mock 覆盖。

#### Scenario: mock 原生对话框取消
- **WHEN** 测试在用户触发打开或保存动作前 mock 对应 Tauri invoke 返回取消
- **THEN** 界面 SHALL 保持一致状态并显示设计规定的取消行为
- **THEN** mock SHALL 在测试结束后恢复，不影响后续用例

#### Scenario: mock IO 失败
- **WHEN** 测试在 IPC 边界注入结构化 IO 或权限错误
- **THEN** 界面 SHALL 显示可操作的错误反馈且保留未保存内容
- **THEN** 失败用例 SHALL 不在临时根外制造权限或文件破坏

### Requirement: 分层执行与失败诊断
E2E 套件 SHALL 分为 PR 冒烟集和扩展回归集。Linux CI MUST 在 Xvfb 中运行冒烟集；手动或计划任务 SHALL 可运行回归集。失败时 CI MUST 保留截图、WDIO 输出、前端日志、Rust 后端日志和应用日志，并且产物不得包含文档正文、凭据或未脱敏的私有绝对路径。

#### Scenario: PR 冒烟通过
- **WHEN** 拉取请求触发 E2E CI 且所有冒烟路径成功
- **THEN** E2E 作业 SHALL 成功并报告执行过的测试数量
- **THEN** 普通 Vitest/Rust 作业 SHALL 可独立并行执行

#### Scenario: PR 冒烟失败
- **WHEN** 任一冒烟路径断言失败、超时或应用异常退出
- **THEN** E2E 作业 SHALL 失败
- **THEN** CI SHALL 上传该运行的截图和脱敏日志用于诊断

#### Scenario: 执行扩展回归集
- **WHEN** 维护者手动或通过计划任务选择回归套件
- **THEN** 运行 SHALL 包含冒烟集之外的文件树、原生交互替代和异常恢复路径
- **THEN** 回归结果 SHALL 与 PR 冒烟结果分开报告
