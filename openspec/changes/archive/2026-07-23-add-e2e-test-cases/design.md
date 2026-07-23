## Context

MarkFlow 已有 e2e 测试基础设施（WebdriverIO + Tauri Plugin + Mocha），包含 3 个测试用例。测试编排由 `e2e/run.mjs` 负责：创建临时隔离目录 → 写入默认 settings 和测试文档 welcome.md → 构建 Tauri e2e debug 版本 → 启动 WDIO 运行测试套件。

当前 page object (`e2e/page-objects/app.mjs`) 提供了基础选择器（ready、wysiwyg、source、sourceContent、filesTab、toast 等），但缺少文件树项点击、设置面板交互等操作所需的封装。

## Goals / Non-Goals

**Goals:**
- 新增 3 个 smoke 测试覆盖文件操作、编辑保存、设置面板这 3 个核心工作流
- 扩展 page object 使测试用例简洁可读
- 所有测试在 e2e 框架下稳定运行，不新增依赖

**Non-Goals:**
- 不修改 Rust 后端代码
- 不修改前端业务逻辑
- 不修改 WDIO 配置或测试编排流程（run.mjs）
- 不引入新的测试框架或工具

## Decisions

### 决策 1：测试内容追加保存采用 Tauri invoke 直接验证磁盘文件

**方案**：在编辑保存测试中，点击 save 按钮后使用 `browser.tauri.execute()` 调用后端 `read_file` 命令验证磁盘内容。

**理由**：保存按钮的最终效果是文件写入磁盘。通过 Tauri invoke 直接读取磁盘文件是最可靠的验证方式（比通过 UI 重新打开文件更高效、更稳定）。WDIO 的 `browser.tauri.execute()` API 已在本项目 pdf-export 测试中验证有效。

**备选**：重新点击文件树打开文件再检查编辑器内容。会增加测试复杂度和时长，且引入不必要的 UI 交互环节。

### 决策 2：设置面板测试不验证持久化到磁盘

**方案**：打开设置 → 切换 tab（验证 UI 响应）→ 切换主题（验证 class 变化）→ 关闭 → 重新打开（验证状态保持）。不检查 settings.json 文件内容。

**理由**：设置面板的打开/关闭是纯前端 DOM 操作，不重新加载页面。变量 `settingsModalHide` 控制单例，关闭后设为 null，重新打开时重新创建内容。主题切换后 `.theme-swatch` 的 `selected` class 会保留，重新打开时通过 `hydrateSettingsUI()` 从内存 `currentSettings` 恢复。直接验证 UI 状态即可覆盖核心交互路径。settings.json 持久化已在 Rust 单元测试中覆盖。

### 决策 3：在 run.mjs 中扩展 welcome.md 测试文档结构

**方案**：当前 welcome.md 内容为 `# MarkFlow E2E\n\nInitial test document.\n`。扩展为包含标题、段落、列表的 Markdown 内容，使「文件打开与内容加载」测试能验证多行内容的正确加载。

**理由**：更好的测试信号——验证编辑器能渲染结构化 Markdown 而非仅单行文本。测试断言检查标题文本 `MarkFlow E2E Testing` 和段落文本 `段落内容` 的出现。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 添加值内容时 CM6 输入框定位不稳定 | 使用 `sourceContent.click()` 先聚焦再 `addValue()`，已有 editor-mode 测试验证此模式可用 |
| 设置面板重新打开后 UI 状态与上次一致依赖于内存状态而非磁盘 | 符合预期——测试验证的是 UI 交互循环（打开→操作→关闭→打开→恢复），不测试磁盘持久化 |
| 保存按钮点击后异步写入未完成时读取文件 | 点击保存后等待 toast 出现（`"已保存"`），确保写入完成后再 invoke 读取 |
| 文件树数据路径因 workspace 路径不同而异 | 使用 `data-path$="/welcome.md"` 结尾匹配，已有 app-launch 测试验证此选择器有效 |
