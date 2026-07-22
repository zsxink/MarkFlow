## Why

Issue #156 指出当前设置面板存在多个结构性问题：设置项位置不合理的混排、不影响运行时行为的「僵尸」设置项、图片存储模式逻辑不统一（同一个「无特殊操作」值在不同入口产生不同副作用），以及跨平台的路径解析不完善。这些问题降低了设置系统的可维护性和用户体验的一致性，需要在引入新行为前先重构数据模型与 UI 布局。

## What Changes

### 设置面板布局调整

- **编辑器标签页重组**：将拼写检查和自动换行从「通用」移动到「编辑器」；移除「实时预览」(livePreview) 开关（当前无对应行为）；代码高亮开关改为实际控制围栏代码块在 WYSIWYG 和源码模式下的高亮渲染
- **通用标签页精简**：仅保留自动保存、自动保存间隔和文件树性能设置
- **PlantUML 服务器地址设置**：风险提示独立一行显示，默认服务器地址以可选择文本呈现；输入框放在所有说明下方

### 图片设置重构

- **存储模式 enum 化**：以三个面向用户的目录规则替代工作区/文档 assets 混合语义
  - `custom`（默认）— 复制到指定路径，显示路径输入框和目录选择器，默认 `./images`，支持相对路径与跨平台绝对路径
  - `document-dir` — 复制到当前 Markdown 文档同级目录 `./`，不显示路径输入框
  - `document-named-dir` — 复制到文档同级的 `./${filename}-images`，例如 `guide.md` 对应 `./guide-images/`，不显示路径输入框
- **按来源应用规则**：剪贴板图片始终保存；本地图片和网络图片分别通过开关决定是否复制/下载到存储位置，未勾选时保留原始本地引用或网络 URL
- **引用样式**：支持相对路径（默认）与绝对路径；相对路径始终相对于 Markdown 文档目录
- **剪贴板图片行为变更**：不再提供选项，始终保存到存储位置
- **剪贴板命名模板**：默认 `img-${date:yyyyMMdd}${time:HHmmss}`，仅作用于剪贴板图片；扩展名保持剪贴板图片的实际格式，重名时才追加 `-1`、`-2`
- **自定义路径增强**：支持 `./images`、`../assets`、POSIX 绝对路径、Windows 盘符路径（如 `D:\Pictures\MarkFlow`）、UNC 路径；相对路径以当前 Markdown 文档所在目录为基准
- **未保存文档暂存**：相对目录规则在文档首次保存前写入当前用户的 MarkFlow 本地数据目录；首次保存时先迁移图片并更新引用，再写入 Markdown。绝对路径可立即生效

### 数据模型迁移

- 用枚举替换松散 boolean/string 字段，确保默认值与 JSON 序列化向后兼容
- 设置版本号提升到 version 3，迁移逻辑自动填充新字段；已有文档和已有图片不移动，仅影响后续插入

### 代码高亮设置生效

- `codeHighlight` 设置项在 WYSIWYG 和源码模式下实际控制代码块语法高亮的显示与隐藏
- 新增 `applyCodeBlockSettings()` 的响应式调用

### 后端命令安全约束

- 图片相关文件操作走专用的 Rust 命令（不走通用的文件 IPC），限制操作范围
- 符号链接和 `..` 遍历不允许逃逸出已授权的图片存储根目录

**BREAKING**: `imageStorageMode` 的旧工作区/文档 assets 值迁移到新的三种目录规则；命名策略改为剪贴板专用模板

## Capabilities

### New Capabilities

- `image-storage-engine`: 统一图片处理服务，覆盖本地文件、剪贴板、网络三种来源的图片存储与路径解析行为；包含跨平台路径解析层（符号链接安全、盘符支持、UNC 支持）
- `settings-code-highlight`: 代码高亮开关的实际控制能力，使 `codeHighlight` 设置在 WYSIWYG 和源码模式下均真正影响代码块的高亮渲染

### Modified Capabilities

- `image-streaming`: 存储模式枚举变更、剪贴板图片不再可选、新增专用后端命令的安全约束
- `image-naming`: 移除 `strategy: 'original'` 时的直接引用（因为「无特殊操作」模式已移除），命名策略始终在存储目录中生成唯一文件名；完善带 query/hash 的 URL 扩展名提取（使用 MIME 类型回退）
- `dialog-system`: 设置面板 DOM 结构调整 — 标签页重新分组，图片面板表单元素变更

## Impact

- **前端**：`src/components/settings.ts` — 设置面板 DOM 和事件绑定大改；`src/types/settings.ts` — Settings interface 修改；`src/types/editor.ts` — ImageSettings 接口废弃改用新类型；`src/lib/imageUtils.ts` — 核心逻辑适配新枚举；`src/lib/editor.init.ts` — 图片粘贴/拖拽处理适配；`src/lib/editor.image.bubble.ts` — 气泡编辑适配；`src/lib/pathUtils.ts` — 跨平台路径解析增强
- **Rust 后端**：`src-tauri/src/config/settings.rs` — Settings struct 字段变更；新增专用图片文件命令；路径安全校验
- **测试**：路径解析、设置迁移、设置界面、图片处理、后端命令新增覆盖；移除对已废弃设置的旧测试
- **设置持久化**：自动迁移旧版 settings.json 到新版数据模型
