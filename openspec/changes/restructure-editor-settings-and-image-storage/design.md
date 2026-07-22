## Context

当前 MarkFlow 的设置系统和图片处理层在 Issue #156 代码审计中发现了结构性问题：

1. **设置面板标签页混排** — 拼写检查和自动换行属于编辑器行为却放在「通用」标签页；`livePreview` 和 `codeHighlight` 开关不对应实际运行时行为
2. **图片存储模式 `'none'` 不一致** — 同一设置值在不同入口表现不同：粘贴/拖拽 `→` Base64、工具栏 `→` Tauri asset URL、网络图片 `→` 保留 URL
3. **路径解析不完善** — 自定义相对路径仅通过字符串前缀判断，缺少 Windows 盘符和 UNC 支持；路径逃逸没有保护
4. **网络图片下载文件名脆弱** — URL 含 query/hash 时仅通过原始 URL 提取扩展名，缺少 MIME 类型回退
5. **图片处理入口分散** — 粘贴、拖拽、工具栏插入各有一套处理逻辑

本设计在现有架构基础上做增量重构，不改变整体分层（Tauri 2.0 + Rust 后端 + TypeScript 前端）。

## Goals / Non-Goals

**Goals:**
- 设置面板标签页重新分组，移除僵尸设置项
- 图片存储模式用枚举重写，消除行为不一致
- 跨平台路径解析层（macOS/Linux/Windows 盘符/UNC）
- 代码高亮开关真正生效
- 路径安全（符号链接、`..` 逃逸保护）
- 旧版 settings.json 自动迁移到新数据模型
- 所有改动均添加/更新测试覆盖

**Non-Goals:**
- 不改设置持久化方式（仍使用 `settings.json` + Rust cache）
- 不改设置面板工厂函数（仍使用 `showModal`）
- 不改图片编辑气泡 UI 框架
- 不改图片右键菜单
- 不引入新的外部依赖

## Decisions

### 1. 枚举 vs string union 类型

**决策**: 前端 TypeScript 使用 `string` 类型 + 枚举值常量（而非 `enum` 关键字），后端 Rust 使用 `String` 字段 + serde validation。前端 `enum` 关键字在序列化为 JSON 时行为与后端不兼容；`string` + 常量确保前后端 JSON wire format 一致。Rust 端不引入 `serde_repr` 等依赖。

**备选**: Rust `enum` + serde tag。但 Rust enum 的 serde tag 要求 JSON 值是字符串枚举，与前端 `enum` 生成的数字不兼容。

### 2. 设置迁移策略：懒迁移 vs 启动迁移

**决策**: 在 Rust 的 `parse_settings` 中做一次性的自动迁移，而不是在前端 hydration 时迁移。Rust 端 `Settings::default()` 和 `parse_settings` 负责检测 `version` 字段，旧版（version 1）自动映射到新版字段。前端不做迁移逻辑。

**备选**: 前端 `hydrateSettingsUI` 时检测旧字段。会增加前端复杂度且迁移时机不可控（settings 可能尚未加载）。

### 3. 图片服务：单服务 vs 继续分散

**决策**: 新增 `ImageService` class 封装所有图片处理入口，替换 `imageUtils.ts` 中的导出函数。Service 持有 `ImageSettings` 状态并在设置变更时刷新。保持 `imageUtils.ts` 作为薄封装层对外暴露兼容接口，减少外部调用方的改动量。

**备选**: 将所有函数在 imageUtils.ts 内用内部状态管理。但会导致该文件继续膨胀且难以测试。

### 4. 代码高亮生效方式：CSS 隐藏 vs 插件控制

**决策**: 两种模式分别处理——
- WYSIWYG：通过 CSS class approach，给 `.ProseMirror` 容器添加 `.no-code-highlight` 类，由 CSS 覆盖所有 `.hljs-*` token 颜色为继承色。性能开销最小，无需重建编辑器。
- 源码模式：通过 CodeMirror `syntaxHighlighting` 配置控制。关闭时设置 `HighlightStyle` 为空，开启时恢复。

**备选**: WYSIWYG 使用 ProseMirror 插件动态移除高亮节点。但 CSS 方案响应更快且不涉及编辑器状态变更。

### 5. 路径逃逸检测：Rust canonicalize + 前缀验证

**决策**: 在 Rust 专用图片命令中用此流程：1) `fs::canonicalize` 解析输入路径；2) 与授权根目录（`workspace/assets` 或 `customPath`）的 canonicalize 结果对比前缀；3) 不在授权目录内则拒绝。前端不做最终校验（仅做 UI 提示）。

**备选**: 前端做路径解析 + 逃逸检测。但 Rust 有更好的文件系统权限控制，且 escape 检测必须由后端强制执行以避免绕过。

## Risks / Trade-offs

- **[风险]** 旧版 settings.json 中的废弃字段在新 Rust struct 中不反序列化 → **缓解**: `#[serde(default)]` + `#[serde(deny_unknown_fields)]` 不使用，允许未知字段被静默忽略
- **[风险]** 设置迁移逻辑测试覆盖不足，导致用户升级后设置丢失 → **缓解**: Rust 端编写测试覆盖所有旧→新版迁移场景；前端 hydration 时若缺少新字段则使用 DEFAULT_SETTINGS 填充
- **[风险]** 剪贴板图片始终保存到存储位置可能不符合部分用户预期（原 `'none'` 模式下 inline base64 更快） → **缓解**: 移除 `'none'` 的决策经过 issue 讨论确认；如用户要求可在后续迭代中支持「保存为 base64」选项（新枚举值不破坏向后兼容）
- **[风险]** WYSIWYG CSS 覆盖高亮方式可能因 tiptap 版本升级导致选择器失效 → **缓解**: 使用 `.ProseMirror` 容器级 class 而非依赖具体 DOM 结构；测试中验证关闭高亮时 `window.getComputedStyle` 颜色值
- **[风险]** `imageLocalFileBehavior: 'reference'` 引用源文件路径，文件移动后引用断裂 → **缓解**: 这是已知行为，在设置描述中明确提示用户「引用模式——图片文件移动后路径可能失效」
- **[风险]** Windows 路径大小写（`D:` vs `d:`）不一致 → **缓解**: 使用 `Path::canonicalize` 统一归一化
