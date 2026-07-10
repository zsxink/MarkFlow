## Context

当前 `saveSettings` 接受 `Partial<Settings>` 但直接传给 Rust 的 `save_settings` 命令。Rust 端 `Settings` struct 大多数字段无 `#[serde(default)]`，导致 serde 反序列化失败。

调用链：
1. `sidebar.ts:127` → `saveSettings({ lastSidebarTab: "files" })` → Rust 反序列化失败 → `.catch(() => {})` 吞掉错误
2. `settings.ts:414` → `saveSettings(currentSettings)` — 发送完整对象，正常工作

失败后 `storage.ts:62` 执行 `settingsCache = settings as Settings`，将 partial 对象存入缓存，后续读缓存得到不完整数据。

## Goals / Non-Goals

**Goals:**
- `saveSettings` 接受 `Partial<Settings>` 并正确合并为完整对象后再发送到 Rust
- `sidebar.ts` 的 `saveSettings({ lastSidebarTab })` 调用正常持久化
- 消除 `settingsCache` 被 partial 对象污染的风险

**Non-Goals:**
- 不修改 Rust 端 `Settings` struct（后端保持接收完整对象）

## Decisions

### 决定：前端合并而非 Rust 端加 `#[serde(default)]`

- **选择**：在 `storage.ts:saveSettings` 中将 partial 参数与缓存/默认值合并为完整 `Settings`
- **理由**：
  - Rust 端保持严格类型检查，安全
  - 避免 Rust struct 字段全都改成 `Option` 或加 `#[serde(default)]` 的过度宽松
  - 合并逻辑集中在一处，所有调用路径自动受益
- **备选**：Rust 端加 `#[serde(default)]` — 但会让 Rust 层被动接受残缺数据，未来 bug 更难发现

### 决定：错误处理

- `saveSettings` 内部合并、invoke 失败仍需调用方处理
- `sidebar.ts` 的 `.catch(() => {})` 改为 `logException` 记录错误

## Risks / Trade-offs

- [并发写入] 多次快速调用 `saveSettings` 可能读到过期缓存 → 接受，settings 非高竞争资源
- [合并优先级] partial 参数 > 缓存 > 默认值 → 通过展开顺序保证：`{ ...DEFAULT_SETTINGS, ...cached, ...partial }`
