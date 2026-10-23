# Tasks

## 1. 主许可证与许可证文本库

- [x] 1.1 创建根目录 `LICENSE`（MIT 全文，版权行 `Copyright (c) 2026 zsxink`），验证 `head -1 LICENSE` 为版权行且 `grep -c "MIT License" LICENSE` 为 1
- [x] 1.2 创建 `third-party/texts/` 并放入所需许可证模板正文：`MIT.txt`、`Apache-2.0.txt`、`OFL-1.1.txt`、`MPL-2.0.txt`、`Unicode-3.0.txt`、`CDLA-Permissive-2.0.txt`、`CC0-1.0.txt`、`BSD-2-Clause.txt`、`BSD-3-Clause.txt`、`ISC.txt`、`Zlib.txt`、`Unlicense.txt`、`BlueOak-1.0.0.txt`、`Python-2.0.txt`、`0BSD.txt`、`BSL-1.0.txt`、`CC-BY-4.0.txt`（如实际不需要可删），验证每个文件非空且包含对应许可证的标题行
- [x] 1.3 把 Feather Icons 的 MIT 文本作为 `third-party/texts/MIT.txt` 之外的项目素材归属记录写入 `third-party/assets/PROVENANCE.md`，验证记录中可查到 Feather 的版权行与许可证

## 2. 清单生成与门禁脚本

- [x] 2.1 实现 `scripts/lib/license-inventory.mjs`：npm 侧从 `package-lock.json` 取生产依赖、从 `node_modules/<pkg>/package.json` 与包内许可证文件补全许可证标识与版权行；Rust 侧从 `cargo metadata --all-features --format-version 1` 取依赖树并读取 crate 目录内的许可证文件，验证对当前仓库生成 240 条 npm 记录与 587 条 Rust 记录
- [x] 2.2 实现 SPDX 表达式规范化与双许可证选择逻辑（`(MIT OR GPL-3.0-or-later)`、`(MPL-2.0 OR Apache-2.0)`、`MIT OR Apache-2.0 OR LGPL-2.1-or-later` 等记录原始表达式 + `chosen` 字段），验证快照中 jszip、dompurify、r-efi 三条记录的 `chosen` 为项目实际采用的许可证
- [x] 2.3 实现 `scripts/generate-license-inventory.mjs`：输出 `third-party/inventory.npm.json`、`third-party/inventory.cargo.json` 与渲染后的 `THIRD-PARTY-NOTICES.md`，验证脚本在断网条件下可完成（不发起网络请求）且输出文件按许可证分组
- [x] 2.4 实现 `scripts/check-license-inventory.mjs`，支持 `--npm` / `--cargo` / 无参数三种模式：校验覆盖完整性、允许清单、所需文本存在、快照与重新生成结果一致，验证手工改动快照后校验以非零码失败并打印依赖名
- [x] 2.5 在 `package.json` 增加 `licenses:generate` 与 `licenses:check` 脚本，验证 `npm run licenses:check` 在当前仓库通过

## 3. 清单门禁接入 CI

- [x] 3.1 在 `.github/workflows/ci.yml` 的 `web-checks` job 中新增 `node scripts/check-license-inventory.mjs --npm` 步骤，验证本地以同样命令在 `npm ci` 后可运行并通过
- [x] 3.2 在 `.github/workflows/ci.yml` 的 `rust-checks` job 中新增 `node scripts/check-license-inventory.mjs --cargo` 步骤（置于 `cargo test` 之前），验证本地 `cargo metadata` 可用时该命令通过
- [x] 3.3 在 `openspec/specs/INDEX.md` 的"体积、字体、CI…"路由行补入 `license-compliance`，验证路由表指向新规范

## 4. 字体授权与改名

- [x] 4.1 编写 `scripts/regenerate-cjk-font-subset.py`，用 fontTools 从上游 OTF 重新生成 GB2312 Level 1 子集 woff2，并把 `name` 表 id 1/4/6 改为 `MarkFlow Serif SC`、保留 id 0 版权行、新增子集说明行，验证生成的两个 woff2 码位集合为 4193、字形数与旧文件一致
- [x] 4.2 运行脚本重生成 `src/assets/fonts/SourceHanSerifSC-Regular-common.woff2` 与 `-Bold-common.woff2`，验证 `python3 -c` 读出的 `name` id 1 为 `MarkFlow Serif SC` 且 `cmap` 覆盖的 GB2312 Level 1 字符数为 3755
- [x] 4.3 更新 `src/styles/variables.css`：`@font-face` 的 `font-family` 改为 `MarkFlow Serif SC`，`--font-serif` 回退链保留上游族名作为系统回退，验证 `grep -c "MarkFlow Serif SC" src/styles/variables.css` 为 3
- [x] 4.4 更新 `src/export/theme/fonts.ts` 与 `src/export/theme/base.ts` 的字体族名，验证 `npm test -- src/export` 全部通过
- [x] 4.5 编写 `third-party/fonts/PROVENANCE.md`：记录 Source Serif 4（4.005R，纯封装，逐表比对结论）与 Source Han Serif SC（2.003R，子集化 + 改名，含 pyftsubset 参数、上游与本地 SHA-256、旧文件 SHA-256），验证记录中每个随包字体都有上游标识、上游校验值、本地校验值与修改说明
- [x] 4.6 把 `src/assets/fonts/` 下两份 OFL 文本接入 `third-party/texts/OFL-1.1.txt`（去重后单份）并在 `THIRD-PARTY-NOTICES.md` 中引用，验证清单门禁的 OFL 文本存在性检查通过

## 5. 素材授权记录

- [x] 5.1 编写 `third-party/assets/PROVENANCE.md`：标注应用图标（`assets/markflow-icon-256.png`、`src-tauri/icons/*`）、字标（`assets/markflow-wordmark.{svg,png}`）、DMG 背景（`assets/dmg-background.svg` → `src-tauri/assets/dmg-background.png`，生成器 `scripts/build-dmg-background.mjs`）为项目原创并记录设计源与 SHA-256，验证每项都有设计源路径与校验值
- [x] 5.2 在同一记录中登记工具栏图标派生自 Feather Icons（MIT）并附上游链接与许可证，验证 Feather 的 MIT 文本出现在 `THIRD-PARTY-NOTICES.md`

## 6. 隐私与数据流文档

- [x] 6.1 编写 `docs/privacy.md`，覆盖本地存储位置（设置文件与日志目录的 macOS/Windows/Linux 路径）、无自动遥测、无自动更新、PlantUML 数据流，验证文档中三平台路径与 `src-tauri/src/paths.rs`、`logger.rs` 的实现一致
- [x] 6.2 编写 `docs/privacy.en.md`，与中文版内容逐条对应，验证两份文档的章节结构一致
- [x] 6.3 核对 `src/ui/settings/markup.ts` 中现有 PlantUML 警告文案与隐私文档表述不冲突，验证产品内警告未被删除或弱化

## 7. 发行包与 README

- [x] 7.1 在 `src-tauri/tauri.conf.json` 设置 `bundle.licenseFile: "../LICENSE"` 与 `bundle.resources`（携带 `THIRD-PARTY-NOTICES.md` 与 `third-party/texts/`），验证 `node -e` 读出的配置字段正确且 `npx tauri build --help` 不报配置错误
- [x] 7.2 更新 `README.md` 与 `README.en.md` 的许可证段落指向 `LICENSE`，并在项目文档表格加入隐私说明与第三方声明入口，验证两份 README 的许可证段落均含 `LICENSE` 链接
- [x] 7.3 在 `README.md` 与 `README.en.md` 的功能/文档区域补充 PlantUML 数据流的一句话说明并指向隐私文档，验证两份 README 都含指向 `docs/privacy` 的链接

## 8. 集成验证

- [x] 8.1 运行 `npm test`、`npx tsc --noEmit`、`npm run build`、`npm run check-size`、`node scripts/check-layering.mjs`，验证全部通过且中文字体仍在 4MB 预算内
- [x] 8.2 运行 `npm run licenses:check` 与 `npm run validate:openspec`，验证清单门禁与 OpenSpec 校验均通过
- [x] 8.3 运行 `bash scripts/check-capabilities.sh` 与 `bash scripts/check-archive-synced.sh`，验证既有门禁未被本次改动破坏
