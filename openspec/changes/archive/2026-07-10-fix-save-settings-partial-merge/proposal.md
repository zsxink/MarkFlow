## Why

`sidebar.ts` 调用 `saveSettings({ lastSidebarTab })` 发送部分字段到 Rust，但 Rust 端 `Settings` struct 大多数字段无 `#[serde(default)]`，serde 反序列化失败。`.catch(() => {})` 吞掉错误，导致侧边栏标签偏好永不持久化，同时 `settingsCache` 被 `Partial<Settings>` 污染（`as Settings` 强制转换）。

## What Changes

- `storage.ts` 中 `saveSettings` 在调用 `invoke('save_settings')` 前，将 partial 参数与缓存/默认值合并为完整 `Settings` 对象
- `sidebar.ts` 中 `saveSettings({ lastSidebarTab })` 调用移除空的 `.catch(() => {})`，改为正常的错误处理
- 确保所有 `saveSettings` 调用路径都发送完整 `Settings` 对象到 Rust

## Capabilities

### New Capabilities
- `settings-persistence`: 设置持久化可靠性 — 确保从任意调用路径都能正确保存设置

### Modified Capabilities

无 spec 级行为变更。

## Impact

- `src/lib/storage.ts` — `saveSettings` 函数增加合并逻辑
- `src/components/sidebar.ts` — 移除空的 `.catch(() => {})`
