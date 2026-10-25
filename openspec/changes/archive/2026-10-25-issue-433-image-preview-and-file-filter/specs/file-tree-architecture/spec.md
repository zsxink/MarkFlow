# Spec Delta

## ADDED Requirements

### Requirement: 支持格式过滤

文件浏览器 SHALL 提供设置开关 `fileBrowserShowUnsupportedFiles`（默认 `false`，默认隐藏不支持格式的文件），控制是否列出不支持格式的文件。支持格式定义为 `.md` 与图片扩展名 `svg`/`jpg`/`jpeg`/`png`/`gif`/`webp`/`bmp`（大小写不敏感）。开关关闭（默认）时，目录枚举 SHALL 过滤不支持格式的文件（目录节点 MUST 始终显示，不受开关影响）；开关打开时不做格式过滤。过滤 SHALL 在后端目录枚举链路统一实施（分页枚举与单条目读取/增量事件同规则），保证分页游标与可见条目一致；设置字段 SHALL TS/Rust 两侧同步持久化，默认值单真相在 TS `DEFAULT_SETTINGS`。切换开关后文件树 SHALL 即时刷新反映新列表。

#### Scenario: 默认隐藏不支持格式

- **WHEN** 用户未修改设置（默认 `fileBrowserShowUnsupportedFiles: false`）
- **THEN** 文件浏览器仅列出 `.md` 与 7 种图片扩展名文件（目录全部显示），`.TXT`、`.CSV`、无扩展名文件默认不可见

#### Scenario: 关闭开关隐藏不支持格式

- **WHEN** 用户关闭「显示不支持格式的文件」开关并保存设置
- **THEN** 文件浏览器即时刷新，仅列出 `.md` 与 7 种图片扩展名文件；目录节点不受影响仍全部显示；`.TXT`、`.CSV`、无扩展名文件被隐藏

#### Scenario: 增量事件遵循同一过滤规则

- **WHEN** 开关关闭时工作区内新建/重命名产生一个不支持格式文件（如 `notes.txt`）与一个支持格式文件（如 `pic.webp`）
- **THEN** watcher 增量插入遵循同一规则：`pic.webp` 出现在文件树，`notes.txt` 不出现；开关重新打开并刷新后 `notes.txt` 可见

#### Scenario: 过滤不影响分页一致性

- **WHEN** 某目录包含大量不支持格式文件且开关关闭
- **THEN** 分页枚举在后端过滤后返回，可见条目数与「加载更多」游标推进一致，不存在因前端过滤导致的支持格式文件丢失

#### Scenario: 设置持久化与旧配置兼容

- **WHEN** 保存含 `fileBrowserShowUnsupportedFiles` 的设置并重启应用，或读取不含该字段的旧设置文件
- **THEN** 前者恢复所存值；后者补默认值 `false`（隐藏不支持格式），不报错
