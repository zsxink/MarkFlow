# Tasks

## 1. TS 设置模型与纯函数链

- [x] 1.1 `src/types/settings.ts`：删除 8 个旧字段与默认值，新增 `wysiwygMaxBytes?: number`（默认 1048576）、`sourceMaxBytes?: number`（默认 10485760）、`maxLines?: number`（默认 1000000），保持 `satisfies Settings` 单真相模式；验证：文件内 grep 旧字段名仅剩 0 处、新默认值三项正确
- [x] 1.2 重构 `src/utils/file-size-tier.ts`：`FileTierConfig` 改为 `{ wysiwygMaxBytes, sourceMaxBytes, maxLines }`，`tierConfigFromSettings` 窄映射新字段（缺失回落 `DEFAULT_SETTINGS`），`determineTier` 改为 `huge = size > sourceMaxBytes || lines > maxLines; large = size > wysiwygMaxBytes`（全严格 `>`）；重写 `src/utils/__tests__/file-size-tier.test.ts`（默认配置、三档边界、自定义配置回落）；验证：`npm test -- src/utils/__tests__/file-size-tier.test.ts` 通过
- [x] 1.3 重构 `src/editor/markdown/eligibility.ts`：`AdmissionLimits`/`DEFAULT_ADMISSION_LIMITS`/`admissionLimitsFromSettings` 改派生 `wysiwygMaxBytes`/`maxLines`，`classifyEligibility` 改为 `bytes > maxBytes || lines > maxLines`（统一严格大于），删除兼容导出 `WYSIWYG_MAX_ADMISSION_BYTES/LINES`；同步更新 `src/editor/__tests__/eligibility.test.ts` 与 `src/editor/__tests__/admission.test.ts`（边界与 `admissionReasonLabel` 文案断言显式注入限制值，不依赖默认值）；验证：`npm test -- src/editor/__tests__/eligibility.test.ts src/editor/__tests__/admission.test.ts` 通过
- [x] 1.4 删除 `src/editor/complexity.ts` 与 `src/editor/__tests__/complexity.test.ts`，摘除 tiptap 扩展注册处的 complexity 插件；验证：`grep -rn "complexity" src/ --include="*.ts"` 仅剩无关命中（或零命中），`npx tsc --noEmit` 无 complexity 相关报错
- [x] 1.5 删除 `src/infra/ui-ports.ts` 的 `showDegradationBar`/`hideDegradationBar` 端口定义与 `src/main.ts` 的注册（保留 `src/ui/degradation-bar.ts` 本体与 fileops 直连调用）；同步修正引用端口集合的测试 mock；验证：`npm test` 中 ui-ports 相关测试通过
- [x] 1.6 组集成验证：`npx tsc --noEmit` 全绿

## 2. Rust 侧与 e2e fixture

- [x] 2.1 `src-tauri/src/config/settings.rs`：删 8 个旧字段、默认函数与 `Default` impl 条目，增 `wysiwyg_max_bytes`/`source_max_bytes`（u64，默认 1048576/10485760）与 `max_lines`（u32，默认 1000000）+ serde default；改写 `src-tauri/src/commands/settings/tests.rs` 三个契约测试为新字段（默认契约 / legacy JSON 缺字段回落 / load-mutate-save 往返存活）；验证：`cd src-tauri && cargo test settings` 通过
- [x] 2.2 清理 `e2e/run.mjs` settings fixture 中的 4 个旧档位字段；验证：`node --check e2e/run.mjs` 通过且 fixture 无旧字段名

## 3. 设置 UI

- [x] 3.1 重写 `src/ui/settings/markup.ts` 文档上限分组：三个设置行——所见即所得文档大小（数字框 + KB/MB `<select>`）、源码文档大小（数字框 + KB/MB `<select>`）、最大行数（数字框，后缀「行」），id 为 `setting-wysiwyg-max-size`/`setting-wysiwyg-max-size-unit`/`setting-source-max-size`/`setting-source-max-size-unit`/`setting-max-lines`，保留 `setting-document-limits-error` 错误容器与 subfield 分组视觉
- [x] 3.2 重写 `src/ui/settings/fields.ts` 文档上限读写与校验：读取含单位换算（`value * (unit === 'MB' ? 1048576 : 1024)`，NaN 回落）；回显 ≥1MB 且整除 MB 优先 MB 否则 KB；`validateDocumentLimits` 改为「全部 > 0 且 wysiwygMaxBytes ≤ sourceMaxBytes」无条件校验，删除 `pairEdited`/`DocumentLimitsBaseline` 豁免机制；`buildSettingsFromUI` 写新字段；验证：随 3.4 panel 测试
- [x] 3.3 `src/ui/settings/panel.ts`：change 监听 id 集合更新为新 id，错误显示/清除路径复用；`applySettingsToUI` 走新回显；确认 `panel.ts:190-197` 未知键剥离逻辑对新 DEFAULT_SETTINGS 自然剥离旧键
- [x] 3.4 重写 `src/ui/settings/__tests__/panel.test.ts` 文档上限场景：水合默认（1MB/10MB/100 万的展示）、修改合法值持久化（单位换算字节）、WYSIWYG > 源码报错不写入、0/负数报错、恢复合法可保存；验证：`npm test -- src/ui/settings/__tests__/panel.test.ts` 通过

## 4. 基准断言与全量门禁

- [x] 4.1 修正 `src/__tests__/tiptap-v3-benchmark.test.ts`：原依赖默认准入 256KB 的 `source-only` 断言改为显式注入小限制的写法（或按新默认 1MB 调整期望），tier 证据注释同步新档位语义；验证：`npm test -- src/__tests__/tiptap-v3-benchmark.test.ts` 通过
- [x] 4.2 全量门禁通过：`npm test`、`npx tsc --noEmit`、`npm run build`、`node scripts/check-layering.mjs`、`cd src-tauri && cargo fmt --check && cargo clippy -D warnings && cargo test`、`npx openspec validate simplify-doc-size-settings --strict`
