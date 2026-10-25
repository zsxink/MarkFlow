# Design

## Context

现状 8 个上限字段定义于 `src/types/settings.ts:42-53`（默认值 `:93-100`），Rust 侧 `src-tauri/src/config/settings.rs:66-85` 同步透传。三条消费链：

- **tier 判定**（`src/utils/file-size-tier.ts`）：4 个档位字段 → `determineTier`（全 `>` 比较）→ `src/ui/sidebar/fileops.ts:381-442` 打开文件时弹 huge 对话框 / 显示降级条
- **WYSIWYG 准入**（`src/editor/markdown/eligibility.ts`）：`wysiwygAdmissionBytes`（`>=`）/`wysiwygAdmissionLines`（`>`）→ 拒绝留源码 + toast（`admissionReasonLabel` 插值实际上限）
- **complexity 闸门**（`src/editor/complexity.ts`）：`wysiwygMaxNodes`/`wysiwygMaxTextLength`，超限 toast「部分编辑功能已限制」，`limited` 标志全仓库零消费者，事务照常放行

设置 UI 在 `src/ui/settings/markup.ts:66-107`（8 个数字输入 + inline width:100px），校验 `fields.ts:147-171`（含 pairEdited 存量豁免机制）。旧 settings.json 兼容：Rust 无 `deny_unknown_fields`（静默忽略），TS 侧 `panel.ts:190-197` 持久化前剥离未知键。

约束：分层（types ← utils ← editor ← ui）、默认值单真相在 `DEFAULT_SETTINGS`（`satisfies Settings` 模式）、TS/Rust 结构体同步（Rust 往返测试逐一断言）。

## Goals / Non-Goals

**Goals:**
- 8 项设置 → 3 项（`wysiwygMaxBytes`/`sourceMaxBytes`/`maxLines`），默认 1MB/10MB/100 万，可配范围覆盖 #411 目标（10MB/50MB，不设 max 上限）
- tier 与准入两条保留链路改读新字段，行为边界明确且默认值下与现状差异最小化
- complexity 链路与 ui-ports 死端口（`showDegradationBar`/`hideDegradationBar`）彻底移除
- TS/Rust/测试/spec 四侧一致收敛，旧配置零迁移

**Non-Goals:**
- #411 性能工程（准入异步化、渲染优化、benchmark 基线、进度提示）
- #405 主体的设置界面信息架构重构（文件树两项设置移除、tab 重排、ARIA、搜索、恢复默认）
- 设置项 max 上限防呆（保持现状无 max 的自由度，性能归 #411）

## Decisions

### D1. 新字段命名与语义映射

- `wysiwygMaxBytes?: number`（字节，默认 1048576）：接管 WYSIWYG 准入体积语义（原 `wysiwygAdmissionBytes`）
- `sourceMaxBytes?: number`（字节，默认 10485760）：接管 huge 弹窗阈值语义（原 `hugeFileThreshold`）——「源码模式的大小上限」与 #411「源码最大 50MB」直接对应
- `maxLines?: number`（行，默认 1000000）：统一行数闸门，同时约束准入与 tier-huge

**备选**：保留 `wysiwygAdmissionBytes` 名只改默认——被否，语义已从「准入实验值」升级为「WYSIWYG 模式容量」，且新名与 UI 文案/单位选择配套更清晰。

### D2. tier 派生规则（`file-size-tier.ts` 重构）

```
huge  = size > sourceMaxBytes || lines > maxLines
large = size > wysiwygMaxBytes（且非 huge；行数不参与 large）
normal = 其余
```

全部严格 `>`。rationale：
- large 的动作是降级条「建议切换到源码模式」——与「体积超过 WYSIWYG 容量、只适合源码」天然同义，阈值直接复用 `wysiwygMaxBytes`，不引入第四个概念
- 行数不给 large 中间档：原 5000 行起提示「大文件」对日常文档是噪音；行数闸门统一在 `maxLines` 触发 huge（建议只读），与准入行数共享一个心智模型
- 默认值下行为对比：1MB–10MB large（与现状一致）、>10MB huge（一致）、5000–50000 行从 large 变 normal（降级条变少，可接受）、5 万–100 万行从 huge 变 normal（弹窗变少，符合 #411 方向）、>100 万行 huge

**备选**：单阈值+比例派生（large = huge/2）——被否，两个独立语义（WYSIWYG 容量 / 源码容量）不该由伪数学耦合。

`FileTierConfig` 改为 `{ wysiwygMaxBytes, sourceMaxBytes, maxLines }`，`tierConfigFromSettings` 窄映射同步改。

### D3. 准入边界统一为严格 `>`

`classifyEligibility`（eligibility.ts）从 `bytes >= maxBytes || lines > maxLines` 改为 `bytes > wysiwygMaxBytes || lines > maxLines`，与 tier 比较符一致。「上限 1MB」的自然语义是恰好 1MB 仍可进入。`AdmissionLimits` 改为 `{ maxBytes, maxLines }` 由新字段派生；`admissionReasonLabel` 文案结构不变（插值新值）。兼容导出 `WYSIWYG_MAX_ADMISSION_BYTES/LINES` 删除（引用方全部在本仓测试内，直接改写）。

### D4. complexity 插件整体删除

删除 `src/editor/complexity.ts`、tiptap 扩展注册、`complexity.test.ts`。理由：`limited` 零消费者、文案虚假（「部分编辑功能已限制」实际无任何限制）、每事务 `doc.descendants` 全量遍历对大文档是纯负担——删除对 #411 性能方向净收益。原「准入上调的安全网」论证已失效：安全网实质不存在。

**备选**：内化为固定常量保留 toast——被否，保留虚假提示与每事务开销，违背「不掩盖死代码」。

### D5. 设置 UI：3 输入 + 单位选择

两个体积项 = 数字框 + `<select>`（KB/MB），行数 = 纯数字框。存储统一字节；回显时 ≥1MB 整除优先 MB（`bytes % 1048576 === 0` 用 MB，否则 KB），非整除 KB 由用户自行选择单位输入。校验：3 项 > 0 且 `wysiwygMaxBytes <= sourceMaxBytes`（相等合法——large 区间为空是有意配置）；`pairEdited` 与 `DocumentLimitsBaseline` 豁免机制删除，校验无条件执行。DOM id 沿用语义命名（`setting-wysiwyg-max-size`/`setting-wysiwyg-max-size-unit`、`setting-source-max-size`/`setting-source-max-size-unit`、`setting-max-lines`），错误容器 `setting-document-limits-error` 保留。

### D6. Rust 侧同步与测试改写

`settings.rs` 删 8 字段（含默认函数与 `Default` impl），增 3 字段 `wysiwyg_max_bytes`/`source_max_bytes`（u64）/`max_lines`（u32）+ serde default。`tests.rs` 三个 WYSIWYG 契约测试改写为新字段（默认契约 / legacy 回落 / 往返存活）。`e2e/run.mjs` fixture 的 4 个旧档位字段删除（Rust 容忍未知键，不删也不挂，但清理避免误导）。

### D7. ui-ports 死端口删除

删除 `ui-ports.ts` 的 `showDegradationBar`/`hideDegradationBar` 端口定义与 `main.ts:74-75` 注册。降级条真实链路（fileops 直连 `../degradation-bar`，同属 ui 层）不受影响；`degradation-bar.ts` 本体保留。注意同步检查 ui-ports 相关测试的 mock 端口集合。

## Risks / Trade-offs

- [默认准入 256KB→1MB 后，256KB–1MB 文档进 WYSIWYG 若卡顿] → 属 #411 性能工程范围；本变更不设 max 防呆，性能基线由 #411 建立。tiptap-v3-benchmark 中依赖旧默认的断言（`documents.large.repeat(6)` 的 source-only 判定）随本变更同步改写为显式注入限制的写法，不再依赖默认值。
- [5 万–100 万行文档不再弹 huge 确认框，直接全功能打开] → 符合 #411「行数上限 100 万」定案；真超大文档由 `maxLines` 触发 huge 兜底。
- [旧字段从 settings.json 物理消失（首次保存后）] → 设计意图（剥离即清理），Rust serde 容忍 + TS 剥离双向保障，无报错路径。
- [REMOVED/ADDED requirement 改名导致 spec 引用漂移] → 归档时同步主规范并跑 `openspec validate --all` + `check-archive-synced.sh`。

## Migration Plan

无需数据迁移。发布即生效：旧配置静默回落新默认（用户旧自定义值丢失——8 项旧自定义无法一一映射到 3 项新语义，定案不做映射；256KB 等旧默认用户无感知）。回滚 = 还原代码版本，旧字段配置已被剥离的 settings.json 在旧版本下回落旧默认，无损坏。

## Open Questions

（无）
