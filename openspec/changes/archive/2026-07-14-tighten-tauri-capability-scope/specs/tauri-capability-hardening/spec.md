## ADDED Requirements

### Requirement: 前端不存在绕过 Rust 校验的通用文件操作通道
系统 SHALL NOT 在 capability 中挂载任何 `fs:allow-*` 权限。所有文件读写操作 SHALL 仅通过 Rust `invoke` 命令执行，由 `resolve_path` 和 `validate_path_in_workspace` 进行路径校验。

#### Scenario: FS 插件权限不存在
- **WHEN** 检查 `src-tauri/capabilities/main.json` 和所有 capability 文件
- **THEN** 权限列表中不包含任何 `fs:allow-*` 条目

#### Scenario: 前端文件操作通过 Rust command 执行
- **WHEN** 前端调用 `read_file`、`write_file`、`create_file`、`create_dir`、`rename_path`、`delete_path`、`copy_file`、`read_single_dir`、`read_dir_recursive`、`file_exists`
- **THEN** 这些操作均通过 `invoke()` 发送到 Rust 侧，不经过 Tauri FS 插件

### Requirement: capability 不再匹配所有窗口
系统 SHALL 将主窗口 capability (`main.json`) 绑定到标签 `"main"`，SHALL NOT 使用 `"*"` 通配符匹配所有窗口。

#### Scenario: 主窗口 capability 仅匹配主窗口
- **WHEN** 检查 `main.json` 的 `windows` 字段
- **THEN** `windows` 仅包含 `["main"]`

#### Scenario: 动态创建的窗口有独立 capability
- **WHEN** `open_file_in_new_window` 命令创建新窗口（标签为 `window-{timestamp}` 格式）
- **THEN** 新窗口拥有独立的 capability 文件（`window-minimal.json`），仅包含 `core:default` 和 dialog 权限，不包含 FS 或 shell 权限

#### Scenario: 动态窗口无 shell 权限
- **WHEN** 检查 `window-minimal.json` 的权限列表
- **THEN** 不包含 `shell:allow-open` 或任何 `fs:allow-*` 权限

### Requirement: shell:allow-open 限制协议和目标
系统 SHALL 将 `shell:allow-open` 限定为仅允许打开本地目录路径和 `https:` 协议的 URL。SHALL NOT 允许 `file:`、`javascript:` 或其他协议。

#### Scenario: 本地目录可通过 shell:open 打开
- **WHEN** 用户在图片上下文菜单点击"打开文件所在"，调用 `open(getParentDir(localPath))`
- **THEN** 操作成功执行，在系统文件管理器中打开对应目录

#### Scenario: 拒绝非预期 scheme 的 URL
- **WHEN** `shell:allow-open` 收到 `javascript:alert(1)` 或 `file:///etc/passwd` 等非预期 scheme 的 URL
- **THEN** 操作被拒绝，不执行

#### Scenario: 允许 https URL 打开
- **WHEN** `shell:allow-open` 收到 `https://example.com` 的 URL
- **THEN** 操作成功执行，在默认浏览器中打开

### Requirement: asset protocol 无法读取工作区外的本地图片
系统 SHALL 将 `assetProtocol.scope` 限定到当前工作区允许的图片目录。SHALL NOT 允许通过 asset protocol 读取工作区外的本地图片文件。

#### Scenario: 工作区内图片可通过 asset protocol 加载
- **WHEN** Markdown 文件引用工作区内的图片（如 `![alt](./images/photo.png)`）
- **THEN** 图片通过 asset protocol 成功加载并显示

#### Scenario: 工作区外图片无法通过 asset protocol 加载
- **WHEN** 渲染器尝试通过 asset protocol 加载工作区外的图片路径
- **THEN** 请求被拒绝，图片不显示

#### Scenario: 外部链接图片保持可用
- **WHEN** Markdown 文件引用外部 URL 图片（如 `![alt](https://example.com/photo.png)`）
- **THEN** 图片通过正常 HTTP 请求成功加载

### Requirement: 外部链接和合法本地图片功能保持可用
在收紧 capability 后，系统 SHALL 保持以下功能正常工作：外部 URL 图片显示、本地工作区图片显示、图片右键菜单的所有操作（复制、另存、复制路径、打开文件所在）。

#### Scenario: 外部图片正常显示
- **WHEN** Markdown 中包含 `![alt](https://example.com/img.png)` 引用
- **THEN** 图片正常渲染显示

#### Scenario: 本地图片正常显示
- **WHEN** Markdown 中包含 `![alt](./relative/path.png)` 引用且文件存在于工作区
- **THEN** 图片正常渲染显示

#### Scenario: 图片右键菜单功能完整
- **WHEN** 用户右键点击本地图片
- **THEN** 显示"复制到剪切板"、"另存为"、"复制路径"、"打开文件所在"菜单项，且所有操作正常执行

### Requirement: CI 检查 capability 配置漂移
系统 SHALL 在 CI 中包含 capability 配置校验脚本，检查主 capability 不包含 `fs:allow-*` 权限、不使用 `"*"` 窗口匹配、不包含全局通配的 asset scope。

#### Scenario: CI 拒绝包含 FS 权限的 capability 配置
- **WHEN** `main.json` 包含 `fs:allow-*` 权限
- **THEN** CI 检查失败，输出违规权限列表

#### Scenario: CI 拒绝使用 `"*"` 窗口匹配的 capability 配置
- **WHEN** `main.json` 的 `windows` 字段包含 `"*"`
- **THEN** CI 检查失败，输出违规配置

#### Scenario: CI 通过合法配置
- **WHEN** `main.json` 不包含 `fs:allow-*` 权限、`windows` 为 `["main"]`、asset scope 限定到工作区路径
- **THEN** CI 检查通过

