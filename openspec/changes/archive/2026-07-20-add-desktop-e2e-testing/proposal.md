## Why

MarkFlow 现有自动化测试能快速覆盖 TypeScript 模块和 Rust 逻辑，却无法验证真实 Tauri 窗口中的编辑器、菜单、IPC、文件持久化与设置恢复是否能协同工作。Issue #133 需要补上这一层可在开发机和 CI 重复执行的界面回归保障，并让失败具有足够的截图和日志证据可供定位。

## What Changes

- 建立基于 WebdriverIO、`@wdio/tauri-service` 和 embedded WebDriver provider 的真实 Tauri 桌面 E2E 测试入口，保留 Vitest 作为独立的快速反馈层。
- 仅在测试构建中启用 WDIO Tauri 插件和对应权限，生产构建不包含测试执行或 IPC 调试能力。
- 建立稳定定位与就绪协议，以语义化角色、可访问名称和必要的 `data-testid` 取代坐标、样式类和固定时长等待。
- 为每次运行创建独立的临时配置根目录、工作区与文档夹具，串行执行会共享应用状态的用例，并在结束后清理，禁止读写用户真实文件和设置。
- 首批覆盖应用启动、Markdown 编辑与格式化、WYSIWYG/源码模式往返、保存后重开、文件树新建/重命名/删除和设置持久化；使用可控 IPC mock 覆盖原生对话框与 IO 错误反馈。
- 新增独立 E2E CI 工作流：Linux + Xvfb 运行 PR 冒烟套件，失败时上传截图、WDIO 输出、前端日志和 Rust 应用日志；回归套件可手动或定时执行。
- 将稳定后的桌面冒烟套件纳入拉取请求质量门，同时保证 `npm test` 不构建或启动桌面应用。

## Capabilities

### New Capabilities

- `desktop-e2e-testing`: 定义真实 Tauri UI 自动化的测试构建边界、启动与就绪、稳定定位、数据隔离、核心流程覆盖、原生交互替代方案和 CI 诊断产物。

### Modified Capabilities

- `regression-coverage`: 在现有 Rust、前端模块和构建门禁之外，增加独立的桌面 E2E 冒烟门禁及其执行范围。

## Impact

- 前端入口和关键控件需要暴露应用就绪状态、语义化定位信息及少量稳定 test id。
- `src-tauri` 需要加入仅测试构建可用的 WDIO 插件、权限和隔离配置根目录支持；正式 release 构建行为保持不变。
- 新增 `e2e/` 目录、WDIO 配置、夹具/生命周期辅助代码、独立 npm scripts 和开发依赖。
- `.github/workflows/` 增加桌面 E2E 工作流，并复用现有 Node、Rust、Tauri Linux 依赖与缓存策略。
- 现有文件、设置与日志路径需要在测试构建中解析到临时根目录；测试不得访问开发者或 CI runner 的真实 MarkFlow 数据。
