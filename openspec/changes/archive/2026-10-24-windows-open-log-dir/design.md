# Design: windows-open-log-dir

## Context

- 后端 `get_log_dir`（`src-tauri/src/logger.rs`）返回 `normalize_path()` 结果，Windows 上为正斜杠形态 `C:/Users/...`；该函数同时服务于日志展示，不能简单改回反斜杠。
- 前端 `@tauri-apps/plugin-shell` 的 `open()` 在后端按 `tauri.conf.json` 的 `plugins.shell.open` 正则校验，盘符分支 `[a-zA-Z]:\\.*` 只接受反斜杠，正斜杠本地路径一律被拒（issue #377 根因）。
- 现有三个本地路径打开点：`src/ui/native-menu.ts:111`（无失败提示）、`src/ui/file-tree-context-menu.ts:167`（有 toast 兜底）、`src/ui/image-context-menu.ts:202`（有 `reportUserActionError` 兜底）。
- 后端命令错误统一走 `AppError { code, message }`（`src-tauri/src/error.rs`）；前端 `classifyError`（`src/infra/error.ts`）可将其映射为可恢复提示文案。
- `tauri-plugin-opener`（v2）是 Tauri 官方为「打开路径/定位文件」提供的插件，Rust API 为 `app.opener().open_path(...)` 与 `reveal_item_in_dir(...)`，不经 shell 插件的白名单。

## Goals / Non-Goals

**Goals**

- Windows（及所有平台）上三个本地路径入口可用，路径分隔符形态无关。
- 菜单动作失败有用户可见反馈（toast），消除「点了没反应」。
- 保持既有规范约束：统一错误类型、错误分类、结构化日志、分层不反向依赖。

**Non-Goals**

- 不改 `normalize_path` / `get_log_dir` 的返回形态（归一化路径对后端命令透明）。
- 不调整 shell 插件白名单或移除 shell 插件（外部 URL 反馈入口仍在用）。
- 不为 opener 插件新增前端 npm 依赖或 capability 权限（仅经 Rust API 调用）。

## Decisions

### D1: 用 `tauri-plugin-opener` 的 Rust API，而非改白名单或 std::process

- 改白名单（如放行 `C:/.*`）治标：白名单本意是约束 URL scheme，用它放行任意本地路径反而扩大攻击面，且三个入口仍依赖前端路径形态正确。
- `std::process` 手写 `explorer /select,` / `open` / `xdg-open` 需要自担各平台分支与转义细节；opener 插件由官方维护并处理了这些差异。
- 选 opener 的 Rust API（在自有命令内调用）：不新增 npm 依赖、不需要 capability 权限项（权限仅约束插件自身的 IPC 命令），调用面收在一条后端命令里。

### D2: 一条通用命令 `open_in_file_manager`，目录=打开、文件=定位

- 三处入口语义本就一致（右键文案「在文件资源管理器中显示」即 reveal 语义）；按 `path.is_dir()` 区分，命令保持单一职责。
- 替代方案是 `open_log_dir` + `reveal_path` 两条命令——命令数量翻倍但逻辑重复，不取。
- 副作用说明：文件树 reveal 对「文件」的行为从「用默认应用打开文件」修正为「在文件管理器中定位」（原 shellOpen 语义与菜单文案不符，属顺手修正，见 spec 的「定位文件」场景）。

### D3: 路径不存在先校验，返回 `AppError::io`

- 命令入口 `path.exists()` 前置校验，避免 opener 层报出难分类的系统错误；错误消息带上原路径便于诊断（日志侧已有私有路径脱敏兜底）。
- 其余失败（打开器报错）映射为 `AppError::io`，消息保留插件原始错误。

### D4: 菜单分发器统一补 toast

- `dispatchNativeMenuAction` 的 catch 在 `logException` 之外增加基于 `classifyError` 的 toast（`showToast` 已在该模块引入），与 image 菜单 `reportUserActionError` 的分类提示口径一致。
- 双重 toast 风险：下层处理器（如文件操作）失败时大多自行捕获并 toast 后不再向上抛；对仍向上抛的错误，两层提示均指向同一失败，可接受且优于静默。此口径记入代码注释。

### D5: 命令落点 `src-tauri/src/fs/open.rs`

- `fs/` 已承载文件系统相关交互（watcher、ignore）；打开/定位路径属于同类 OS 交互，新增 `fs/open.rs`，命令经 `fs::open_in_file_manager` 注册进 `lib.rs`。
- 判定逻辑（目录 vs 文件、存在性校验）抽为纯函数便于单元测试；opener 调用薄封装不测（依赖真实 AppHandle），平台差异由插件保证。

## Risks / Trade-offs

- [Windows 实机行为无法在 CI 验证] → 单元测试覆盖判定逻辑与路径容错；代码走查确认调用链；合并后在 issue 中请报告人实机确认。
- [opener 插件引入新依赖] → 仅 Rust 侧、无 npm 变化；版本锁 `2` 系列与现有 tauri 2.x 对齐，`cargo clippy/test` 门禁兜底。
- [菜单双重 toast] → 见 D4，接受同源重复提示，不引入「已提示」状态机（复杂度不值）。
- [`get_log_dir` 仍返回归一化路径] → 后端命令对该形态透明，无需变更；若未来日志目录需在 UI 展示反斜杠，另行处理（out of scope）。

## Migration Plan

1. 分支内新增依赖、命令与单测 → 前端三处替换 → dispatcher 补 toast。
2. 门禁：`cargo fmt/clippy/test`、`npm test`、`npx tsc --noEmit`、`node scripts/check-layering.mjs`、`npx openspec validate --all`。
3. 合并后观察 issue 反馈；如 Windows 实机仍异常，按日志目录中 `native-menu` scope 的结构化错误定位。

## Open Questions

- 无。
