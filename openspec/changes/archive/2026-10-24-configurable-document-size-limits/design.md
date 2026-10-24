# Design

## Context

- 三套上限四处定义且互不引用：`src/editor/markdown/eligibility.ts:42-43`（准入常量，被 `admission.ts`、`single-block-upgrade.ts` 与多个测试 import）、`src/editor/complexity.ts:8,11`（模块私有常量）、`src/utils/file-size-tier.ts:12-17`（`DEFAULT_TIER_CONFIG`）、`src/types/settings.ts:80-83`（死配置默认值，另 Rust `src-tauri/src/config/settings.rs:66-73` 同样声明）。
- `determineTier(size, lines, config)` 的 `config` 参数已存在且有自定义配置测试，唯一生产调用方 `src/ui/sidebar/fileops.ts:385` 未传。
- 设置链路：TS `saveSettings` 整体写入 → Rust `save_settings_inner` 序列化；Rust 侧存在「load→mutate→save」往返（如 `add_recent_file`），**不在 Rust 结构体里的字段会在往返中被丢弃**，新字段必须两侧同步。`getCachedSettings()`（`src/infra/storage.ts:106-108`）提供无 IO 读最新设置，`src/editor/source.ts:144`、`src/editor/extensions/code-block.ts:55` 是编辑器层消费先例。
- 设置面板模式：`markup.ts` 静态分组 → `fields.ts` build/apply（数值输入静默钳制，无错误 UI）→ `panel.ts` change 即持久化并 emit `settings:changed`；`panel.ts:167-171` 按 `DEFAULT_SETTINGS` 键集剥离未知键。
- 准入提示文案 `admission.ts:123-130` 直接引用模块常量插值上限数值；`complexity.ts:48` 文案无数值。
- 分层约束：`types ← utils ← infra ← editor`，`utils`/`editor` 不得 import store；`types` 不得 import `editor`（故默认值数值只能落在 `types`，其余层向下取用）。

## Goals / Non-Goals

**Goals:**

- 八项上限进设置，TS/Rust 同步持久化；默认值与现状完全一致。
- 档位判定、准入分类、复杂度限制三条链路同源读设置；纯函数保持参数注入。
- 校验有错误回显并拒绝保存非法值；提示文案引用实际生效数值。

**Non-Goals:**

- 不做「本次会话临时放宽上限」（issue 标注可评估，留待后续独立变更）。
- 不改变已打开文档的档位/准入判定（spec 明确仅对新打开文档生效）。
- 不给档位/准入之外的其他性能上限（语法高亮行数、Mermaid 超时等 `expensive-task-scheduling` 范畴）做配置。
- 不为状态栏降级超驰补实现（现状缺口，与本次无关）。

## Decisions

### D1: 字段集合与命名——复用 4 个死字段 + 新增 4 个 WYSIWYG 字段

`Settings` 新增：`wysiwygAdmissionBytes`（262144）、`wysiwygAdmissionLines`（10000）、`wysiwygMaxNodes`（10000）、`wysiwygMaxTextLength`（500000）。档位继续用既有 `largeFileThreshold`/`hugeFileThreshold`/`largeFileLineThreshold`/`hugeFileLineThreshold`（消除死配置，不加新名）。默认值逐一等于现状常量，升级零行为突变。

**替代方案**：把档位字段改名为 `largeSizeBytes` 之类。否决——已有字段且 spec 按旧名引用，改名是无谓破坏。

### D2: Rust 结构体同步新增 4 字段（serde default + Default impl）

比照既有四个档位字段的写法（`#[serde(default = "...")]` + 独立默认函数）新增 WYSIWYG 四字段，防「读取-修改-保存」往返丢弃。Rust 侧仍不消费这些值，仅作为透传持久化声明。

### D3: 纯函数参数注入，调用方从缓存设置取值

- `eligibility.ts`：`classifyEligibility(source, limits?)`，`limits` 为 `{ maxBytes, maxLines }`，缺省回落由 `DEFAULT_SETTINGS` 派生的 `DEFAULT_ADMISSION_LIMITS`；保留导出常量 `WYSIWYG_MAX_ADMISSION_BYTES/LINES`（值改为取自 `DEFAULT_SETTINGS`）以兼容既有测试 import。
- `admission.ts`：`decideAdmission(source, limits?)` 透传；`admissionReasonLabel(reason, size?, limits?)` 插值实际生效上限。
- 调用方 `session.ts`/`mode.ts`/`single-block-upgrade.ts` 统一 `getCachedSettings()` → `admissionLimitsFromSettings(settings)`（窄映射函数，放 `eligibility.ts`，入参类型只取 `Settings` 子集）。
- `utils/file-size-tier.ts`：`tierConfigFromSettings(settings)` 窄映射 + `DEFAULT_TIER_CONFIG` 改为从 `DEFAULT_SETTINGS` 派生（单一真相）；`fileops.ts:385` 传 `tierConfigFromSettings(getCachedSettings())`。

依赖方向检查：`editor`/`utils` import `types/settings`（向左）合法；`eligibility.ts`/`file-size-tier.ts` 自身不 import store/infra，纯函数性质保持。

### D4: complexityLimitExtension 在事务处理时实时读设置

扩展只在 `init.ts` 创建一次；改为 `appendTransaction` 内经 `getCachedSettings()` 取当前上限（每事务一次对象读取，开销可忽略；先例 `code-block.ts:55`）。回退常量同样由 `DEFAULT_SETTINGS` 派生。超限 notify 文案改为包含实际数值（节点数或文本长度超限对应插值）。

**替代方案**：订阅 `settings:changed` 重建扩展（compartment）。否决——引入重建时序问题，收益为零。

### D5: 体积字段以 KB 展示与输入，存储仍为字节

存储单位保持字节（与既有字段一致、Rust u64 语义清晰）；`fields.ts` build/apply 边界做 `×1024` / `÷1024` 换算。面板分两个子分组：「所见即所得上限」（准入体积 KB、准入行数、节点数、文本长度）与「大文件档位」（大/超大体积 KB、大/超大行数）。

### D6: 校验错误回显——分组内行内错误 + 跳过持久化

面板既有模式是「change 即存 + 静默钳制」；本分组需要显式校验（跨字段比较无法用钳制表达）。设计：`fields.ts` 新增 `validateDocumentLimits(raw)` 返回错误消息；`panel.ts` 持久化前校验，失败时在分组内显示行内错误元素、跳过本次持久化（生效值保持最近合法值），成功时清除错误照常保存。数值字段仍保留 HTML `min` 属性做第一道防护。

### D7: 提示文案与配置同源

`admissionReasonLabel` 与 complexity notify 的上限数值一律来自传入/读取的配置值，不引用模块常量；`fileops.ts` huge 对话框与降级条文案现状只插值实测值、无阈值数值，保持不动。

## Risks / Trade-offs

- [面板错误回显是新模式，与既有静默钳制并存可能不一致] → 仅本分组启用错误回显（跨字段校验必需）；既有分组行为不变，面板测试分别断言两种模式。
- [KB 换算引入除法取整误差] → 输入为整数 KB、存储为 `KB*1024` 精确换算；回显 `Math.floor(bytes/1024)`，默认值（256/1024/10240 KB）均为整数，无舍入损失。
- [既有测试 import 准入常量构造边界] → 常量保留导出且值不变，边界测试不破；新增自定义 limits 参数化用例。
- [benchmark 测试（tiptap-v3-benchmark 等）绑定默认档位语义] → 默认值不变，跑全量测试即可确认。
- [Rust u32 行数/节点与 TS number 范围] → 字段语义与既有档位字段一致（体积 u64、行数 u32；节点/文本长度比照选 u32/u64），校验在 TS 侧限制正数即可。

## Migration Plan

旧 `settings.json` 无新字段：TS 侧 `DEFAULT_SETTINGS` 合并 + Rust serde default 双重兜底，读写均回落默认值，无需数据迁移。回滚即还原代码，配置文件多出的字段被两侧忽略（TS 剥离未知键、Rust serde 忽略未知字段）。
