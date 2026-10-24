# Proposal

## Why

MarkFlow 有三套互不同源、完全硬编码的文档大小/行数上限：WYSIWYG 准入（256KB/10,000 行）、ProseMirror 复杂度限制（10,000 节点/500,000 字符）、大文件档位（1MB/10MB/5,000/50,000 行）。用户无法按机器性能调整；`Settings` 中已定义的四个档位字段（TS 与 Rust 两侧）全仓库无任何读取点，是死配置；同一份 300KB 文档会「进不了所见即所得，却又只算 normal 档、看不到任何解释」。`document-size-tier` spec 的「可配置阈值」requirement 早已承诺可配置，实现一直缺失。

## What Changes

- 设置面板新增「文档大小/行数上限」分组，暴露八项配置：WYSIWYG 准入体积/行数上限、ProseMirror 节点数/文本长度上限、大文件与超大文件档位的体积与行数阈值（后四项复用既有死字段 `largeFileThreshold`/`hugeFileThreshold`/`largeFileLineThreshold`/`hugeFileLineThreshold`，不再是死配置）。
- TS `Settings`/`DEFAULT_SETTINGS` 与 Rust `Settings` 结构体同步新增 WYSIWYG 四字段（含 serde 默认值），保证 Rust 侧 load→mutate→save 往返不丢弃新字段；默认值与现状数值完全一致，升级无行为突变。
- 所有链路统一从设置读取阈值：`determineTier` 传入用户配置；`classifyEligibility`/`decideAdmission` 通过参数注入准入上限（保持纯函数，不依赖 store）；`complexityLimitExtension` 实时读取缓存设置；未配置或加载失败回落默认值。
- 默认值收敛为单一来源：`DEFAULT_TIER_CONFIG` 与准入/复杂度回退常量均从 `DEFAULT_SETTINGS` 派生，消除四处重复定义的数值漂移。
- 输入校验：数值必须大于 0、大文件阈值严格小于超大文件阈值（体积与行数各自成立）、准入阈值不超过对应大文件档位阈值；非法输入回显错误并拒绝保存。
- 超限提示文案引用实际生效的配置数值（如「文档 320KB，超过所见即所得准入上限 256KB」），不再引用硬编码常量。
- 修改后对新打开的文档立即生效，无需重启；已打开文档不受影响。

## Capabilities

### New Capabilities

- `document-limits-settings`: 定义文档大小/行数上限作为用户设置的行为契约——设置面板分组与持久化（TS/Rust 同步）、各链路统一读取与立即生效、输入校验与错误回显、提示文案引用实际生效数值。

### Modified Capabilities

- `document-size-tier`: 「文档尺寸等级分类」的阈值数值由硬编码改为取自用户设置（默认值维持 1MB/10MB/5,000/50,000 行）；「可配置阈值」从只点名两个体积字段扩展为覆盖全部四个档位字段（体积 + 行数）。

## Impact

- 前端类型：`src/types/settings.ts`（新增 WYSIWYG 四字段 + 默认值）。
- 纯函数：`src/utils/file-size-tier.ts`（`tierConfigFromSettings`、`DEFAULT_TIER_CONFIG` 派生）、`src/editor/markdown/eligibility.ts`（准入上限参数注入）、`src/editor/markdown/admission.ts`（limits 透传 + 文案插值实际值）。
- 接线：`src/editor/markdown/single-block-upgrade.ts`、`src/editor/session.ts`、`src/editor/mode.ts`（调用方注入配置值）、`src/editor/complexity.ts`（实时读设置 + 文案带数值）、`src/ui/sidebar/fileops.ts`（`determineTier` 传配置）。
- 设置面板：`src/ui/settings/markup.ts`、`src/ui/settings/fields.ts`、`src/ui/settings/panel.ts`（分组、KB 换算、校验错误回显）。
- 后端：`src-tauri/src/config/settings.rs`（新增四字段 + serde 默认值 + Default impl）。
- 测试：上述各镜像 `__tests__/`、`src-tauri` settings 测试。
- 兼容性：`document-size-tier` 既有场景的具体数值（500KB/5MB/50MB 等）在默认阈值下行为不变。
