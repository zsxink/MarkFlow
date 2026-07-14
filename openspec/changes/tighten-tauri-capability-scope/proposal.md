## Why

当前 `main-capability` 对所有窗口 (`"*"`) 开放了 10 项 FS 插件权限，但前端实际文件操作全部通过 Rust `invoke` 命令完成，FS 插件权限完全冗余。`shell:allow-open` 无协议/目标限制，`assetProtocol.scope` 用全局图片扩展名通配，渲染器被攻破时可读取磁盘上任意位置的本地图片。过宽的 capability 会放大 XSS 等前端漏洞的影响面。

## What Changes

- 删除 `capabilities/main.json` 中所有冗余的 `fs:allow-*` 权限（10 项），文件操作统一经过 Rust commands 的工作区校验边界
- 将 `shell:allow-open` 替换为带 `protocol` 和 `target` 限制的 scoped permission，仅允许 `https:` scheme 和合法本地目录打开
- 将 `windows: ["*"]` 改为显式窗口标签匹配
- 将 `assetProtocol.scope` 从全局通配收紧到工作区允许的图片目录，工作区变化时通过 Rust 侧安全更新 scope
- 为新窗口（如多文件编辑）拆分最小权限 capability

## Capabilities

### New Capabilities

- `tauri-capability-hardening`: 收紧 Tauri capability 配置——删除冗余 FS 权限、限制 shell:open 协议目标、绑定窗口标签、收紧 asset protocol scope 到工作区范围

### Modified Capabilities

（无现有 spec 需修改）

## Impact

- `src-tauri/capabilities/main.json` — 权限列表精简
- `src-tauri/tauri.conf.json` — `assetProtocol.scope` 从全局改为动态
- Rust 侧可能需要新增 asset protocol scope 更新命令，或在 `set_workspace` 时同步更新
- `imageContextMenu.ts` 使用 `shell:allow-open` 打开目录，需验证 scoped permission 仍满足
- 新增 CI 检查防止 capability 配置漂移
