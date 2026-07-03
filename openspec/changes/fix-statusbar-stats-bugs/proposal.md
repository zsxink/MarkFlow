## Why

状态栏的统计信息存在两个 bug：(1) 光标位置列数显示不正确；(2) 切换到源码模式后，编辑文本时状态栏不会动态更新。

## What Changes

- **修复 `getCursorPos()` 函数中列数计算逻辑**：当前 blockStart 变量从 0 初始化，导致光标在第一个 block 时列数计算可能偏移，需要修正 ProseMirror position 到列号的映射关系。
- **源码模式下监听编辑事件更新状态栏**：当前 `source-editor` textarea 的 `input`/`click`/`keyup` 事件没有触发 `editor-update` 自定义事件，导致状态栏不会更新。需要在源码模式的相关事件中主动派发 `editor-update`。
- **更新 GitHub Issue #6 描述**：补充更详细的 bug 复现步骤和影响范围。

## Capabilities

### New Capabilities
- *(none)*

### Modified Capabilities
- *(none — 纯 bug 修复，不影响产品规格)*

## Impact

- `src/lib/editor.ts` — 修改 `getCursorPos()` 和源码模式事件处理
- `src/components/statusbar.ts` — 可能小幅调整（或其他方案）
- GitHub Issue #6 — 更新描述
