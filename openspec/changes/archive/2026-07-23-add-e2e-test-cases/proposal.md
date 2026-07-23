## Why

现有 e2e 自动化测试覆盖严重不足（仅 3 个 spec：app-launch、editor-mode、pdf-export），核心用户工作流（文件打开、编辑保存、设置交互）完全没有测试保护。随着功能迭代，回归风险持续累积，需要补齐这些基础的端到端测试来建立质量基线。

## What Changes

- 在 `e2e/specs/smoke/` 新增 3 个 e2e 测试用例
- 扩展 `e2e/page-objects/app.mjs` 增加新增测试所需的选择器和辅助方法
- 修改 `run.mjs` 中 welcome.md 的内容，使其包含更丰富的结构以便测试文件内容加载

### 新增测试

1. **文件打开与内容加载** — 点击文件树 welcome.md，验证 WYSIWYG 编辑器正确显示文件内容
2. **编辑、保存与重新加载** — 在源码模式编辑内容 → 点击保存按钮 → 通过 Tauri invoke 读取磁盘文件验证 -> 切换回 WYSIWYG 验证内容显示
3. **设置面板交互** — 打开设置 → 切换 tab → 切换主题 → 确认 UI 响应 → 关闭 → 重新打开验证状态保持

## Capabilities

### New Capabilities

- `e2e-test-coverage`: e2e 端到端测试覆盖，用于验证核心用户工作流的完整性。包含文件操作、编辑保存、设置面板等交互场景的 smoke 测试。

### Modified Capabilities

无。所有新增测试覆盖的都是已有功能，不改变功能本身的 requirement。

## Impact

- `e2e/page-objects/app.mjs` — 新增选择器和辅助方法
- `e2e/specs/smoke/` — 新增 3 个测试文件
- `e2e/run.mjs` — 扩展 welcome.md 测试文档内容（可选）
- 无 Rust 端改动
- 无新依赖
