## Context

当前 Tauri 配置存在三个安全问题：

1. **冗余 FS 权限**：`main.json` 挂载了 10 项 `fs:allow-*` 权限，但前端所有文件操作均通过 Rust `invoke` 命令（`read_file`、`write_file` 等）完成，FS 插件 API 从未被直接调用。这些权限是死代码，扩大了攻击面。
2. **shell:allow-open 无限制**：`imageContextMenu.ts` 的"打开文件所在"功能通过 `@tauri-apps/plugin-shell` 的 `open()` 调用，当前 `shell:allow-open` 无协议/目标限制，被攻破时可执行任意命令或打开任意 URL。
3. **assetProtocol.scope 全局通配**：`tauri.conf.json` 中 `scope.allow` 使用 `**/*.png` 等通配，渲染器可读取磁盘上任意位置的图片文件，不限于当前工作区。

此外 `windows: ["*"]` 匹配所有窗口，新窗口获得与主窗口相同的完整权限。

## Goals / Non-Goals

**Goals:**

- 删除所有冗余 `fs:allow-*` 权限，文件操作完全由 Rust commands 边界控制
- 将 `shell:allow-open` 限定为仅允许 `https:` 协议打开外部链接 + 本地目录路径
- 将 `assetProtocol.scope` 收紧到当前工作区图片目录
- 将 capability 绑定到具体窗口标签，不再使用 `"*"`
- 为 `open_file_in_new_window` 创建的窗口定义独立的最小权限 capability
- 新增 CI 检查防止 capability 配置漂移

**Non-Goals:**

- 不修改 Rust 侧的 `resolve_path` / `validate_path_in_workspace` 逻辑（已有的工作区校验）
- 不修改 `tauri_plugin_fs::init()` / `tauri_plugin_dialog::init()` / `tauri_plugin_shell::init()` 的加载（保留插件注册以确保 invoke handler 正常工作）
- 不实现动态 asset scope 运行时更新（V2 capability 配置为静态，改为在 `set_workspace` 时通过 Rust command 读取工作区路径下的图片目录，前端在渲染时自行拼接 `asset://` URL 并由 Rust 做路径校验）
- 不重构远程图片获取流程（已有完善的 SSRF 防护）

## Decisions

### D1: 删除冗余 FS 权限

**选择**：从 `main.json` 中移除全部 10 项 `fs:allow-*` 权限。

**理由**：`src/lib/storage.ts` 中所有文件操作（`read_file`、`write_file`、`create_file`、`create_dir`、`rename_path`、`delete_path`、`copy_file`、`read_single_dir`、`file_exists`、`read_file_as_base64`、`write_file_from_base64`）均通过 `invoke()` 调用 Rust command，不依赖 FS 插件。`read_dir_recursive` 同样是 Rust command。删除这些权限不影响任何功能。

**替代方案**：保留但添加 scope 限制 — 不必要，因为插件 API 根本没被调用。

### D2: shell:allow-open 限定协议

**选择**：使用 Tauri v2 的 scoped shell permission，限定 `open` 仅允许：
- `https:` 协议的 URL（外部链接）
- 本地目录路径（"在文件管理器中打开"）

具体实现：通过 `scope` 字段指定允许的 URL pattern：
```json
{
  "identifier": "shell:allow-open",
  "allow": [
    { "name": "open", "args": [{ "validator": "^https://.+|^file://.+" }] }
  ]
}
```

**理由**：`imageContextMenu.ts` 调用 `open(getParentDir(localPath))` 打开本地目录，`urlDecorationPlugin.ts` 使用 `window.open()`（不经过 Tauri shell 插件）。外部链接打开也通过 `window.open`。因此 shell:open 仅用于本地目录打开，但保留 https 协议以备未来使用。

**替代方案**：完全删除 `shell:allow-open` — 不可行，`imageContextMenu.ts` 的"打开文件所在"功能依赖它。

### D3: asset protocol scope 收紧

**选择**：移除 `tauri.conf.json` 中的全局 `assetProtocol.scope.allow` 通配配置，改为在 Rust 侧实现受控的 asset 读取。

具体方案：
1. 删除 `tauri.conf.json` 中 `assetProtocol.scope.allow` 的全局通配
2. 图片通过 Rust `read_file_as_base64` / `read_file` 命令读取后以 base64 或 data URL 传入前端，不再依赖 asset protocol
3. 保留 asset protocol 用于 Markdown 中 `asset://` 协议的本地图片引用，但将 scope 限定到工作区路径

**理由**：Markdown 中引用本地图片时 ProseMirror 需要通过 `asset://` 协议加载，完全移除会影响图片预览。将 scope 限定到工作区是合理的折中。

**替代方案 A**：完全禁用 asset protocol — 不可行，Markdown 本地图片引用是核心功能。
**替代方案 B**：使用 Rust command 读取图片为 base64 — 已在使用，但 `asset://` 协议对 ProseMirror 的 `img` 标签更高效（避免 base64 编码开销）。

### D4: 窗口标签绑定

**选择**：将 `main.json` 的 `windows` 从 `["*"]` 改为显式标签列表。

Tauri v2 主窗口默认标签为 `"main"`。`open_file_in_new_window` 创建的窗口标签为 `window-{timestamp}` 格式。

方案：
- `main.json` 绑定 `windows: ["main"]`（主窗口）
- 新建 `window-minimal.json` capability，绑定 `windows: ["window-*"]` pattern，仅授予 dialog 和必要权限

**替代方案**：在 `main.json` 中使用 `windows: ["main", "window-*"]` — 不可行，Tauri v2 不支持 glob pattern 匹配窗口标签。

### D5: 新窗口最小权限

**选择**：为动态创建的窗口（`window-{timestamp}`）创建独立 capability 文件 `window-minimal.json`，仅包含：
- `core:default`
- `dialog:allow-open`（新窗口也需要打开文件）
- `dialog:allow-save`
- `dialog:allow-message`
- `dialog:allow-ask`
- `dialog:allow-confirm`

不包含任何 FS 权限或 shell 权限。

### D6: CI capability 漂移检查

**选择**：新增一个 CI 脚本，检查：
- `main.json` 不包含 `fs:allow-*` 权限
- `main.json` 的 `windows` 不包含 `"*"`
- `assetProtocol.scope.allow` 不包含 `**` 全局通配（限定到工作区路径）

使用简单的 JSON 校验脚本（shell/node），在 CI 中作为 lint 步骤运行。

## Risks / Trade-offs

- **[Risk] 动态窗口标签无法用 glob 匹配** → Tauri v2 不支持 `windows: ["window-*"]` 通配，需要为每个动态窗口创建 capability 或使用 `windows: ["*"]` 但限制权限。选择后者：`window-minimal.json` 使用 `windows: ["*"]` 但权限极少，`main.json` 绑定到 `"main"`。
- **[Risk] 删除 FS 权限后，未来如果有人直接调用 FS 插件 API 会失败** → 这是期望行为——如果未来有人想绕过 Rust 校验，应被阻止。CI 检查可防止重新添加。
- **[Trade-off] asset protocol scope 无法动态更新** → V2 的 asset scope 在 `tauri.conf.json` 中静态配置，运行时无法修改。选择在 Rust 侧做路径校验而非依赖 asset scope 作为唯一防线。
- **[Risk] shell:open 的正则可能过严** → 本地路径不含 `file://` 前缀（`open("/path/to/dir")` 是裸路径）。需要将 validator 改为匹配裸路径 + https URL。
