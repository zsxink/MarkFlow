## 1. 核心修复

- [x] 1.1 `storage.ts` 中 `saveSettings` 增加缓存+默认值合并逻辑：`{ ...DEFAULT_SETTINGS, ...cached, ...partial }`
- [x] 1.2 `storage.ts` 中 `saveSettings` 在 invoke 失败时不更新 `settingsCache`

## 2. 调用方清理

- [x] 2.1 `sidebar.ts` 中 `saveSettings({ lastSidebarTab })` 移除空的 `.catch(() => {})`，改用 `logException`
