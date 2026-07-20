## 1. 测试构建边界

- [x] 1.1 锁定 WebdriverIO CLI/local-runner/Mocha/spec reporter、`@wdio/tauri-service` 与前端 guest plugin 的兼容版本，更新 npm lockfile，并确认 `npm test` 仍不加载 E2E 配置
- [x] 1.2 在 `src-tauri/Cargo.toml` 增加可选 WDIO 与 embedded WebDriver 插件及 `e2e` Cargo feature，更新 Cargo lockfile
- [x] 1.3 在 Tauri builder 中仅于 `e2e` feature 启用时注册两个测试插件，并增加 Rust/配置检查证明普通构建不注册测试能力
- [x] 1.4 让基础 Tauri 配置显式只启用生产 capability，新增 E2E 专用 capability 与合并配置，并验证普通 release 配置不含 WDIO 权限
- [x] 1.5 增加 E2E Vite mode 的启动前 guest plugin 加载和 `test:e2e:build` 脚本，验证可生成 embedded provider 能连接的 debug 二进制

## 2. 数据隔离与应用就绪

- [x] 2.1 重构应用配置根路径解析，使普通构建保持现有平台路径，并让 `e2e` feature 对缺失、相对或不可创建的 `MARKFLOW_E2E_DATA_DIR` fail closed
- [ ] 2.2 将设置、应用日志和配置目录清理统一接入隔离路径，并增加 Rust 测试验证 E2E 路径不会回退到真实 MarkFlow 目录
- [x] 2.3 在前端启动流程完成编辑器、设置、工作区/初始文件和事件监听后设置 `#app[data-app-ready="true"]`，并为启动失败保留未就绪状态与结构化日志
- [x] 2.4 为模式按钮、保存/设置控件和动态文件树节点补齐可访问名称、状态或必要 test id/规范化路径属性，并增加模块测试固定这些定位契约

## 3. E2E 运行器与共享测试工具

- [x] 3.1 新增 `e2e/` 目录、WDIO 配置和 smoke/regression spec 发现规则，设置 embedded provider、`maxInstances: 1`、有界超时和日志输出目录
- [x] 3.2 实现运行生命周期包装器：创建唯一绝对临时根、写入完整设置与文档夹具、传递隔离环境、运行 WDIO、终止应用并在所有退出路径清理
- [ ] 3.3 实现失败产物收集，在清理前保存截图、WDIO 输出、前后端转发日志和应用日志，并对正文、凭据及私有绝对路径执行脱敏
- [ ] 3.4 建立共享 page objects 与条件等待辅助函数，覆盖应用就绪、编辑器、工具栏、文件树、设置和 toast，且通过静态检查或测试禁止固定 pause、坐标和样式 class 定位
- [ ] 3.5 实现测试重启/重新连接与 mock 自动恢复辅助函数，确保同一隔离数据根可验证持久化且用例之间无 mock 或进程残留

## 4. 冒烟用户路径

- [x] 4.1 添加应用启动冒烟用例，断言真实窗口、就绪标记、编辑器和初始临时工作区状态可用
- [ ] 4.2 添加真实编辑用例，输入 Markdown、使用工具栏格式化并断言 WYSIWYG/源码模式往返后的内容与模式状态
- [ ] 4.3 添加真实保存/重开用例，通过界面保存临时文档、重新打开并同时断言编辑器内容和磁盘内容
- [ ] 4.4 添加设置持久化用例，修改代表性设置、重启测试应用并断言界面和行为恢复且真实用户配置未被访问

## 5. 文件树、原生交互与异常回归

- [ ] 5.1 添加真实文件树回归用例，通过界面新建、重命名和删除临时条目，并逐步验证 DOM 与磁盘状态一致
- [ ] 5.2 添加原生文件对话框取消/成功的 invoke mock 用例，断言调用参数、可见结果和测试后 mock 恢复
- [ ] 5.3 添加结构化 IO/权限错误注入用例，断言错误反馈可操作、未保存内容保留且临时根外没有文件改动
- [ ] 5.4 编写 real/mock/release-only manual 覆盖矩阵，列出系统菜单、安装包、原生拖放和 OS 对话框等发布前人工检查边界

## 6. CI 与质量门

- [ ] 6.1 新增独立 E2E GitHub Actions workflow，安装 Tauri Linux 依赖与 Xvfb，复用 npm/Rust 缓存并在 PR/手动触发时构建测试二进制
- [ ] 6.2 在 Xvfb 中运行 smoke 命令，并在失败或取消时上传截图和脱敏日志产物，设置有限保留期与并发取消
- [ ] 6.3 为手动或计划执行的 regression 套件增加独立输入/作业和报告，确保它不延长 `npm test` 命令
- [ ] 6.4 增加普通 release 构建与 capability 安全校验，阻止 WDIO 插件、guest plugin 或测试权限进入发布产物
- [ ] 6.5 记录观察期的运行时长与 flaky 原因，修复不稳定项后将 smoke 作业配置为 required check

## 7. 验证与文档

- [ ] 7.1 在 macOS 本机执行完整 E2E smoke，验证无需外部 WKWebView driver、无需人工操作且清理后无临时进程或用户数据改动
- [ ] 7.2 在 Linux Xvfb 环境执行 smoke 与至少一次 regression，验证失败注入能产出可用截图和脱敏日志
- [ ] 7.3 运行 `npm test`、`npm run build`、Rust tests、Clippy、rustfmt 与 capability 检查，确认现有快速测试和普通构建没有回归
- [ ] 7.4 更新开发文档，说明本机依赖、build/smoke/regression 命令、测试定位规则、夹具隔离、产物位置和常见故障排查
- [ ] 7.5 严格验证 `add-desktop-e2e-testing` OpenSpec change，并将所有规范场景映射到自动化用例或明确的 release-only manual 检查
