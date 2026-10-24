# Tasks

## 1. 类型与持久化字段

- [x] 1.1 在 `src/types/settings.ts` 新增 `wysiwygAdmissionBytes`/`wysiwygAdmissionLines`/`wysiwygMaxNodes`/`wysiwygMaxTextLength` 字段与默认值（262144/10000/10000/500000），在 `src-tauri/src/config/settings.rs` 同步声明四个字段（`#[serde(default = ...)]` + 默认函数 + `Default` impl，体积/文本长度 u64、行数/节点 u32）；在 `src-tauri/src/commands/settings/tests.rs` 补测试：默认值正确、含新字段的设置经 load→mutate→save 往返不丢失，`cargo test --manifest-path src-tauri/Cargo.toml` 通过

## 2. 纯函数参数化与链路接线

- [x] 2.1 参数化 `src/editor/markdown/eligibility.ts`：`classifyEligibility(source, limits?)` + `admissionLimitsFromSettings(settings)` 窄映射 + `DEFAULT_ADMISSION_LIMITS`（由 `DEFAULT_SETTINGS` 派生，保留既有导出常量且值不变）；`src/editor/markdown/admission.ts` 的 `decideAdmission`/`admissionReasonLabel` 透传 limits 并插值实际生效上限；`session.ts`/`mode.ts`/`single-block-upgrade.ts` 调用方从 `getCachedSettings()` 注入；单测覆盖：自定义 limits 边界（自定义阈值下原拒绝文档变可入）、缺省回落默认、`admissionReasonLabel` 文案含配置数值，`npm test -- src/editor` 通过
- [x] 2.2 `src/utils/file-size-tier.ts` 新增 `tierConfigFromSettings(settings)`，`DEFAULT_TIER_CONFIG` 改由 `DEFAULT_SETTINGS` 派生；`src/ui/sidebar/fileops.ts` 的 `determineTier` 传入 `tierConfigFromSettings(getCachedSettings())`；单测覆盖映射正确与自定义档位判定，`npm test -- src/utils src/ui/sidebar` 通过
- [x] 2.3 `src/editor/complexity.ts` 改为在事务处理时经 `getCachedSettings()` 读取节点数/文本长度上限（回退值由 `DEFAULT_SETTINGS` 派生），超限 notify 文案包含实际数值；新增 `src/editor/__tests__/complexity.test.ts` 覆盖默认上限触发与自定义上限触发点，`npm test -- src/editor` 通过

## 3. 设置面板分组与校验

- [x] 3.1 `src/ui/settings/markup.ts` 新增「文档大小/行数上限」分组（两个子分组：所见即所得上限、大文件档位；体积字段以 KB 输入，含行内错误元素）；`src/ui/settings/fields.ts` 实现读写与 KB↔字节换算、新增 `validateDocumentLimits` 校验（全部 >0、large<huge（体积与行数）、准入≤大文件对应阈值）；`src/ui/settings/panel.ts` 持久化前校验，失败回显错误并跳过保存，成功清除错误；`src/ui/settings/__tests__/panel.test.ts` 补用例：水合显示当前值、合法保存持久化、非法（large≥huge、0/负数、准入超档位）回显错误且不写入、恢复合法后可保存，`npm test -- src/ui/settings` 通过

## 4. 集成验证

- [x] 4.1 全量门禁通过：`npm test`、`npx tsc --noEmit`、`npm run build`、`npm run validate:openspec`、`node scripts/check-layering.mjs`、`cargo fmt --manifest-path src-tauri/Cargo.toml --check`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`、`cargo test --manifest-path src-tauri/Cargo.toml`
