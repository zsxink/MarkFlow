# 后端架构代码地图

> Tauri v2 + Rust，负责文件系统、窗口管理、设置持久化

## 技术栈

- **Tauri**：v2（使用 `protocol-asset` feature 加载本地图片）
- **Rust**：edition 2021
- **文件监视**：notify v7（跨平台 fs 事件）
- **日志**：tracing + tracing-appender（文件日志）
- **HTTP 客户端**：reqwest（rustls-tls，用于下载网络图片/抓取页面标题）
- **序列化**：serde + serde_json
- **单实例**：tauri-plugin-single-instance

## 目录结构

```
src-tauri/src/
├── main.rs              # 入口，调用 markflow_lib::run()
├── lib.rs               # 核心：Tauri Builder 配置、IPC 命令注册、窗口管理
├── state.rs             # AppState：workspace_root、file watcher、pending_file、cli_file
├── logger.rs            # 日志初始化 + 前端日志中转命令
├── paths.rs             # 路径规范化工具
├── commands/
│   ├── mod.rs           # 模块导出
│   ├── files.rs         # 文件操作命令（读写、目录遍历、图片处理）
│   └── settings.rs      # 设置命令（load_settings / save_settings）
├── config/
│   ├── mod.rs           # 模块导出
│   └── settings.rs      # 设置结构体定义、JSON 持久化
└── fs/
    ├── mod.rs           # 模块导出
    └── watcher.rs       # FileWatcher：基于 notify 的文件监视器
```

## 启动流程

1. `main.rs` → `markflow_lib::run()`
2. `logger::init_logging()` 初始化文件日志
3. 创建 `AppState`
4. `tauri::Builder` 配置：
   - 插件注册：dialog, fs, shell, single-instance
   - `invoke_handler`：注册所有 IPC 命令
   - `setup`：解析 CLI 参数 / 恢复上次工作区
5. `app.run()`：macOS 处理 `RunEvent::Opened`（文件关联打开）

## IPC 命令清单

### 文件操作（commands/files.rs）
| 命令 | 职责 |
|------|------|
| `read_file` | 读取文件内容为字符串 |
| `write_file` | 写入字符串到文件 |
| `create_file` | 创建新文件（带工作区校验） |
| `create_dir` | 创建目录 |
| `rename_path` | 重命名文件/目录 |
| `delete_path` | 删除文件/目录 |
| `copy_file` | 复制文件/目录（递归） |
| `read_dir_recursive` | 递归读取目录树 |
| `read_single_dir` | 读取单层目录 |
| `file_exists` | 检查文件是否存在 |
| `read_file_as_base64` | 读取文件为 base64（图片用） |
| `write_file_from_base64` | base64 写入文件（图片用） |
| `fetch_remote_image_as_base64` | 下载远程图片转 base64 |
| `download_image` | 下载远程图片到本地路径 |
| `fetch_page_title` | 抓取网页标题（链接粘贴用） |
| `save_mermaid_svg_export` | 导出 Mermaid SVG |
| `save_mermaid_png_export` | 导出 Mermaid PNG |
| `save_image_export` | 通用图片导出 |

### 窗口/生命周期（lib.rs）
| 命令 | 职责 |
|------|------|
| `open_file_in_new_window` | 创建新窗口打开文件（级联定位） |
| `take_pending_file` | 新窗口拉取待打开文件路径 |
| `take_cli_file` | 拉取 CLI 传入的文件路径 |
| `mark_initial_file_handled` | 标记首次文件处理完成（macOS 用） |
| `save_last_window_state` | 保存窗口位置/尺寸 |

### 工作区/历史（lib.rs）
| 命令 | 职责 |
|------|------|
| `set_workspace` | 设置工作区并启动文件监视 |
| `get_workspace` | 获取当前工作区路径 |
| `add_recent_file` | 添加最近文件（最多 10 个） |
| `add_recent_folder` | 添加最近文件夹（最多 5 个） |
| `clear_recent_history` | 清空历史记录 |

### 设置/日志（commands/settings.rs, logger.rs）
| 命令 | 职责 |
|------|------|
| `load_settings` | 加载设置 JSON |
| `save_settings` | 保存设置 JSON |
| `log_frontend_event` | 接收前端日志写入后端日志文件 |

## AppState 结构

```
AppState {
  workspace_root: Mutex<Option<PathBuf>>     // 当前工作区路径
  watcher: Mutex<Option<FileWatcher>>        // 文件监视器实例
  pending_file: Mutex<HashMap<String, String>> // 窗口 label → 待打开文件
  cli_file: Mutex<Option<String>>            // CLI 传入的文件路径
  initial_file_handled: AtomicBool           // 首次文件是否已处理
}
```

## 文件监视机制

- `FileWatcher`（fs/watcher.rs）封装 `notify::RecommendedWatcher`
- 监视工作区目录（递归模式）
- 事件类型：create / modify / delete
- 通过 `app.emit("file-changed", event)` 发送到前端
- 前端 `main.ts` 监听后处理：外部修改提示、文件树刷新

## 安全措施

- `validate_path_in_workspace`：防止路径穿越（跳过 symlink）
- `validate_remote_image_url`：禁止 localhost/私有 IP/非 http(s) 协议
- 远程图片下载：限制 20MB、最多 5 次重定向、每次重定向重新校验 URL
- 文件操作不限制工作区外的读取（Typora 模式），但写入/创建需校验
