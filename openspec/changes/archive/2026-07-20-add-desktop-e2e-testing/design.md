## Context

MarkFlow 是 Tauri v2 桌面应用，前端由 Vite/TypeScript 驱动 ProseMirror 与 CodeMirror，文件、设置、窗口和 watcher 行为通过 Rust command 协作。当前 `npm test` 在 happy-dom 中 mock Tauri API，Rust 测试覆盖后端逻辑，CI 也分别执行两者；但 `src/main.ts` 的异步启动、真实窗口渲染、编辑器模式切换、IPC 串联和磁盘持久化没有跨层验证。

Tauri 当前[推荐 WebdriverIO 与 `@wdio/tauri-service`](https://v2.tauri.app/develop/tests/webdriver/)。该 service 的 embedded provider 在应用内启动 WebDriver server，覆盖 Linux、Windows 和 macOS，避免 macOS 没有外部 WKWebView WebDriver 的限制；Tauri execute、invoke mock 和前后端日志则需要配套 WDIO 插件。现有 CI 使用 Ubuntu 并已安装 Tauri 的 WebKitGTK 构建依赖，适合先增加一个独立 Linux 冒烟作业。

本变更的主要约束是：测试能力不得进入生产构建，自动化不得访问真实 MarkFlow 配置或用户文档，E2E 不得拖慢现有 Vitest 快速反馈，并且异步界面必须使用可观察状态而非时间猜测。

## Goals / Non-Goals

**Goals:**

- 以一条独立命令构建并运行真实 MarkFlow 桌面窗口的 E2E 冒烟测试。
- 在 macOS 开发机和 Linux CI 上使用一致的 embedded provider，不要求付费 driver 或人工点击。
- 用真实 IPC 和临时文件覆盖成功路径，用 command mock 覆盖系统对话框和不可安全制造的错误路径。
- 让每次运行的数据、配置、日志和截图完全隔离，并在失败时保留足够诊断证据。
- 形成可逐步扩展的 smoke/regression 分层，稳定后只把冒烟集设为 PR 必过。

**Non-Goals:**

- 像素级视觉回归、截图基线维护或跨平台 UI 像素一致性。
- 自动点击操作系统文件选择器、权限弹窗、安装器、系统菜单或拖放桌面文件。
- 用 E2E 重复覆盖所有序列化边界、第三方渲染器或已由 Vitest/Rust 精确覆盖的分支组合。
- 在第一阶段建立完整的 Windows/macOS CI 矩阵；这些平台先保留本机执行能力与后续扩展入口。

## Decisions

### 1. 使用 WebdriverIO Tauri service 的 embedded provider

`@wdio/tauri-service` 作为 WDIO service，Mocha 作为测试框架，embedded provider 作为所有桌面平台的默认 driver。它是 Tauri 当前推荐路径，能驱动真实 webview，并提供 `browser.tauri.execute()`、invoke mock、窗口与日志能力。Linux CI 在 Xvfb 中运行，macOS 直接连接应用内 WebDriver server。

没有选择纯浏览器 Playwright，因为它不能验证真实 Tauri 窗口与 Rust IPC；没有直接编排 `tauri-driver`，因为它不支持 macOS 且需要自行管理 driver；没有把桌面 computer-use 工具作为 CI 主方案，因为其定位与环境一致性不适合作为确定性门禁。WDIO 的 browser mode 可作为将来的 renderer 快速层，但不计入本变更要求的真实桌面覆盖。

### 2. 用专用构建特性和配置覆盖隔离测试能力

两个 Rust WDIO 插件均声明为可选依赖，由 Cargo `e2e` feature 启用；`run()` 只在该 feature 下注册插件。基础 `tauri.conf.json` 显式只启用现有 `main-capability`，专用 `tauri.e2e.conf.json` 在构建时合并 `e2e-capability`、选择 E2E 前端构建模式并关闭不需要的安装包生成。前端仅在 E2E Vite mode 下、应用初始化前载入 `@wdio/tauri-plugin`。

`test:e2e:build` 通过 Tauri CLI 的 debug + `e2e` feature + E2E config 生成被测二进制；普通 `npm run tauri build` 不启用 feature，也不包含 E2E capability 或 guest plugin。CI 增加一次普通 release 构建/配置检查，防止测试权限意外泄漏到发布产物。

只使用 `debug_assertions` 的替代方案更简单，但会让日常 `tauri dev` 也暴露调试插件，因此不采用。

### 3. 测试构建对数据根目录采用 fail-closed 隔离

新增统一的应用数据根路径解析：普通构建继续使用平台 `app_config_dir()/MarkFlow`；启用 `e2e` feature 时必须从 `MARKFLOW_E2E_DATA_DIR` 取得绝对临时目录，缺失、非绝对或不可创建时直接拒绝启动，绝不回退到真实目录。设置、应用日志与配置目录清理都必须经该解析入口，工作区则由测试运行器在同一个临时运行根下创建。

`e2e/run` 生命周期包装器在启动 WDIO 前创建唯一运行根、写入完整设置夹具和文档树、设置环境变量，结束时先终止应用再递归清理。失败产物复制到仓库内被 gitignore 的 `e2e/artifacts/` 后再清理临时根。初期 `maxInstances = 1`，避免设置缓存、WebDriver 端口和单实例插件发生跨 worker 竞争。

仅改写 HOME/XDG_CONFIG_HOME 的替代方案会受不同平台目录解析规则影响，也可能误导其他子进程，因此不采用。

### 4. 应用就绪和定位都是显式契约

`src/main.ts` 只在编辑器、设置加载、工作区恢复、事件监听和首个文件处理完成后，将 `#app[data-app-ready="true"]` 设为可见就绪标记；启动失败则记录结构化错误且不得标记 ready。E2E 的第一步等待该属性和关键 editor 元素可交互，不使用固定 `pause()`。

定位优先级为可访问 role/name、稳定 DOM id、最后才是面向测试语义的 `data-testid`。动态文件树节点使用 role 与规范化路径属性定位。禁止坐标、CSS 样式类、DOM 层级链和硬编码睡眠；重试只允许用于最终可观察条件，不能重跑有副作用的操作来掩盖竞态。

### 5. 首批套件按用户路径组织，成功路径使用真实后端

测试分为 `smoke` 与 `regression` 标签/目录，共享 page objects、就绪等待、夹具和清理辅助函数：

- smoke：应用启动；打开临时工作区文档；输入 Markdown 并点击格式化；WYSIWYG/源码往返；显式保存、关闭/重新打开并从磁盘验证；代表性设置保存后重启恢复。
- regression：文件树新建、重命名、删除；冲突或 IO 错误；原生对话框取消/成功反馈；更多恢复路径。

文件、设置和 workspace 成功路径调用真实 command 并检查磁盘结果。测试夹具在启动前写入 `lastWorkspace`，复用现有应用恢复流程进入临时工作区，避免为 E2E 增加可从 UI 调用的后门。

### 6. 系统原生 UI 和异常注入使用受控 mock

系统文件选择器不做坐标自动化。需要验证其前端编排时，在用户动作前通过 `browser.tauri.mock()` mock 对应 invoke，并在每个测试后恢复；断言调用参数、取消/成功结果及可见反馈。难以稳定制造的权限/IO 失败同样在 IPC 边界注入结构化错误，但保存/重开等主链路必须至少保留一条真实磁盘测试。

测试矩阵文档明确标注 real、mock 和 release-only manual 三类覆盖，防止 mock 用例被误认为验证了操作系统集成。

### 7. 独立 CI 作业分阶段成为门禁

新增 `e2e.yml`，PR 与手动触发先执行 `npm ci`、现有快速测试和 E2E 测试构建，再在 Ubuntu + Xvfb 中运行 smoke。作业安装 Tauri 构建依赖与 Xvfb；embedded provider 不依赖外部 `tauri-driver`，但仍使用系统 WebKitGTK。失败或取消时上传截图、WDIO `outputDir`、前端/后端转发日志和隔离目录中的应用日志，并设置有限保留期。

首个实现 PR 可让作业以观察模式运行，连续稳定后再配置为 required check；`regression` 仅在手动触发和后续夜间计划中运行。spec 级门禁要求最终 smoke 成为必过，观察期不代表验收完成。

## Risks / Trade-offs

- **[embedded provider 与插件版本仍在演进]** → 锁定精确依赖版本与 lockfile，在升级 PR 中本机和 Linux CI 同时验证，并保留 service 调试日志。
- **[Tauri 单实例插件或固定端口导致残留进程冲突]** → 串行执行、由 service 管理端口、包装器在清理前确认子进程退出；CI 使用并发取消和唯一临时根。
- **[ProseMirror/CodeMirror 输入法与异步渲染造成偶发失败]** → page object 通过编辑器公开 DOM 和最终内容条件等待，避免逐键延时与固定 sleep；失败保留 DOM/截图/日志。
- **[测试专用插件扩大攻击面]** → Cargo feature、专用 Tauri config、显式 capability 列表和 release 验证共同隔离；E2E 数据根环境变量在普通构建中被忽略。
- **[真实桌面构建增加 PR 时长]** → 与 Vitest 分作业并行、Rust/npm 缓存、仅 smoke 必过；完整 regression 不进入每次提交的快速路径。
- **[Linux 冒烟无法代表全部平台原生差异]** → 主链路保持跨平台可本机运行，平台特定系统交互保留发布前人工清单，稳定后再按缺陷数据扩展 CI matrix。

## Migration Plan

1. 先落地测试构建边界、数据根隔离、就绪标记和一个启动冒烟用例，并验证普通 release 不包含 WDIO 权限。
2. 增加 page objects、夹具、真实编辑/保存/设置路径及文件树回归用例，同时保留现有 `npm test` 行为不变。
3. 加入 Linux Xvfb CI 和失败产物上传，先观察稳定性并记录 flaky 原因。
4. 达到团队约定的连续稳定窗口后，把 smoke 作业设为 required check；regression 保持手动/夜间执行。
5. 如 embedded provider 发生阻断性回归，可暂时撤销 required check 并回退 E2E feature/config，不影响普通构建、Vitest 或 Rust 测试。

## Open Questions

没有阻塞实施的问题。Windows/macOS CI matrix、夜间 regression 频率和 required check 的连续稳定窗口由首批运行时长与 flaky 数据决定，不作为首期实现的前置条件。
