# Proposal

## Why

「文档大小/行数上限」目前暴露 8 个数字输入（WYSIWYG 准入体积/行数、节点数/文本长度、大文件/超大文件体积与行数阈值），认知负担高且语义互相纠缠。#405 补充将其定案精简为 3 项，并与 #411（WYSIWYG 最大 10MB / 源码模式最大 50MB，性能工程另行实施）对齐：设置形态先行落地，性能上限能力由 #411 后续达成，本变更的可配置范围须覆盖 #411 目标值。

## What Changes

- **8 项设置精简为 3 项**（新字段，默认值单真相仍在 `src/types/settings.ts` 的 `DEFAULT_SETTINGS`）：
  - `wysiwygMaxBytes`：所见即所得文档大小（数字框 + KB/MB 单位，默认 1MB），接管原 `wysiwygAdmissionBytes` 的 WYSIWYG 准入语义
  - `sourceMaxBytes`：源码文档大小（数字框 + KB/MB 单位，默认 10MB），接管原 `hugeFileThreshold` 的「文件过大」弹窗阈值语义
  - `maxLines`：最大行数（数字框，默认 100 万），统一行数闸门：同时约束 WYSIWYG 准入与 tier 判定
- **删除 8 个旧设置字段**：`wysiwygAdmissionBytes` / `wysiwygAdmissionLines` / `wysiwygMaxNodes` / `wysiwygMaxTextLength` / `largeFileThreshold` / `hugeFileThreshold` / `largeFileLineThreshold` / `hugeFileLineThreshold`（TS 与 Rust 两侧同步删除；Rust 无 `deny_unknown_fields`，旧 settings.json 中的残留键被静默忽略并在下次保存时剥离，无需版本迁移）。
- **tier 阈值改为派生**：`large` 档 = 体积超过 `wysiwygMaxBytes`（降级条「建议切换到源码模式」语义与「超过 WYSIWYG 上限」天然契合）；`huge` 档 = 体积超过 `sourceMaxBytes` 或行数超过 `maxLines`。默认值下 1MB–10MB 区间行为与现状一致。
- **BREAKING（行为变化）**：
  - WYSIWYG 准入默认 256KB → **1MB**（256KB–1MB 文档从「留源码」变为可进 WYSIWYG）
  - large 档行数维度取消（原 5000 行起显示降级条 → 不再按行数触发 large；行数只经 `maxLines` 触发 huge）
  - huge 档行数阈值 5 万 → 100 万（5 万–100 万行文档从「弹窗建议只读」变为正常打开）
  - WYSIWYG complexity 闸门（`wysiwygMaxNodes`/`wysiwygMaxTextLength`）随设置一并移除：其超限标志 `limited` 无任何下游消费者，超限仅弹一条与实际行为不符的 toast，且插件每事务全量遍历 doc 统计，本身是性能负担
- **输入校验简化**：新 3 项须全为正数，且 `wysiwygMaxBytes` ≤ `sourceMaxBytes`；原 4 条排序规则与「存量默认组合豁免」机制随旧字段删除而移除（新默认组合天然合法）。
- **顺带清理死代码**：删除 `src/infra/ui-ports.ts` 中已注册但零调用方的 `showDegradationBar`/`hideDegradationBar` 端口及 `main.ts` 中的注册（降级条实际由 `ui` 层 fileops 直连，不走端口）。
- **明确非目标**：#411 的性能工程（准入异步化、渲染优化、benchmark 基线）与 #405 主体的其他设置界面重构（文件树两项设置移除、信息架构重排、ARIA、搜索）不在本变更范围。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `document-limits-settings`: 设置项从 8 项精简为 3 项（字段、默认值、控件形式、校验规则全部变更）；「各链路统一从设置读取阈值」的默认值与消费字段更新；复杂度上限相关 requirement 随 complexity 插件移除而删改
- `document-size-tier`: tier 阈值从 4 个独立设置改为由 `wysiwygMaxBytes`/`sourceMaxBytes`/`maxLines` 派生；「文档尺寸等级分类」的默认边界与「可配置阈值」的字段清单变更

## Impact

- **TS**：`src/types/settings.ts`（字段增删 + 默认值）、`src/utils/file-size-tier.ts`（配置结构与派生）、`src/editor/markdown/eligibility.ts`（准入限制结构）、`src/editor/complexity.ts`（整文件删除 + tiptap 扩展注册处摘除）、`src/infra/ui-ports.ts`（删死端口）、`src/ui/settings/{markup,fields,panel}.ts`（8 输入 → 3 输入 + 单位选择 + 校验）、`e2e/run.mjs`（settings fixture 清理旧字段）
- **Rust**：`src-tauri/src/config/settings.rs`（同步删 8 字段增 3 字段 + 默认函数）、`src-tauri/src/commands/settings/tests.rs`（3 个 WYSIWYG 契约测试改写为新字段）
- **测试**：`panel.test.ts`（水合/校验/持久化场景重写）、`file-size-tier.test.ts`（默认配置与判定边界重写）、`eligibility.test.ts` / `admission.test.ts`（准入默认值与边界断言更新）、`complexity.test.ts`（删除）、`tiptap-v3-benchmark.test.ts`（准入默认 256KB→1MB 导致的断言反转修正）
- **兼容性**：旧 settings.json 无需迁移（serde 忽略未知字段 + TS 剥离未知键；Rust load→mutate→save 会物理清除旧键）
