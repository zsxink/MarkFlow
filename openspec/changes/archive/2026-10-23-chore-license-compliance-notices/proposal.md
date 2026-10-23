# Proposal

## Why

仓库公开声明 MIT，但根目录没有 `LICENSE` 文件，随包分发的第三方字体、图标与 Rust/npm 依赖也没有可审查的许可证清单；同时 README 未说明 PlantUML 会把图表源码发往用户配置的服务器。这些缺口让用户无法确认自己拿到的发行包包含什么、受哪些条款约束，也让维护者无法在升级依赖后复核合规状态（Issue #339）。

## What Changes

- **根目录补齐 `LICENSE`**：MIT 全文，版权主体为仓库所有者 `zsxink`，年份取首次提交年份 2026。
- **新增可再生的第三方许可证清单**：
  - `scripts/generate-license-inventory.mjs` 从 `package-lock.json`（生产依赖）与 `cargo metadata`（Rust 依赖树）生成机器可读快照 `third-party/inventory.npm.json`、`third-party/inventory.cargo.json`。
  - `THIRD-PARTY-NOTICES.md` 由同一脚本渲染，列出每个依赖的版本、许可证标识与所需的版权/许可证文本。
  - `scripts/check-license-inventory.mjs` 作为离线门禁：快照必须覆盖 `package-lock.json` / `src-tauri/Cargo.lock` 中的全部条目，许可证标识必须落在允许清单内，需要随包分发文本的许可证（OFL、Apache-2.0、MPL-2.0、Unicode-3.0、CDLA-Permissive-2.0、CC0-1.0 等）必须有对应文本文件。CI 与本地 `npm test` 之外新增该步骤。
- **字体授权落地**：
  - 记录字体来源与再分发依据（`third-party/fonts/PROVENANCE.md`）：Source Serif 4 4.005R 与 Source Han Serif SC 2.003R 的上游包、上游 SHA-256、子集化/转换参数与产物 SHA-256。
  - Source Serif 4 的 woff2 只做格式封装（除 WOFF2 压缩与 `head` 必要重算外，各表与上游 TTF 逐字节一致），按 OFL-FAQ 2.2.1 不构成 Modified Version，保留保留字体名 `Source`。
  - Source Han Serif SC 子集（GB2312 Level 1，4193 个码位）按 OFL-FAQ 2.6 属于 Modified Version，不得继续使用保留字体名 `Source`：**BREAKING** 内置中文字体族名由 `Source Han Serif SC` 改为 `MarkFlow Serif SC`，同步 `src/styles/variables.css`、`src/export/theme/fonts.ts`、`src/export/theme/base.ts`。
  - 两份 OFL 文本随仓库与发行包分发。
- **随包素材授权记录**：`third-party/assets/PROVENANCE.md` 记录应用图标、字标、DMG 背景图（自有原创，含生成脚本与 SHA-256）以及工具栏图标的来源（派生自 Feather Icons，MIT），并把 Feather 的 MIT 文本纳入清单。
- **隐私与数据流说明**：新增 `docs/privacy.md` 与 `docs/privacy.en.md`，写明本地存储位置、无自动遥测、无自动更新与联网行为，并明确 PlantUML 的对外数据流（仅当用户自行配置服务器时，仅发送该图表源码，由用户选择和控制服务器）。保留产品内既有警告提示。
- **发行包携带许可证文本**：`src-tauri/tauri.conf.json` 设置 `bundle.licenseFile` 并把 `LICENSE`、`THIRD-PARTY-NOTICES.md` 与 `third-party/texts/` 作为 `bundle.resources` 打进安装包。
- **中英文文档一致性**：`README.md` 与 `README.en.md` 的许可证段落改为指向 `LICENSE`，并新增隐私与第三方声明入口。

## Capabilities

### New Capabilities

- `license-compliance`: 主许可证文件、第三方许可证清单的生成与门禁、随包字体与素材的授权可追溯性、发行包内许可证文本的可获取性。

### Modified Capabilities

- `font-stack`: 内置中文字体族名改为自有名称以符合 OFL 保留字体名条款，并要求记录来源、子集化参数与许可证文本。
- `plantuml-render`: 除设置界面警告外，用户文档也必须说明图表源码会发往用户配置的第三方服务器。
- `readme-sync`: README 许可证段落必须与 `LICENSE` 一致，并提供隐私说明与第三方声明入口。

## Impact

- 新增文件：`LICENSE`、`THIRD-PARTY-NOTICES.md`、`docs/privacy.md`、`docs/privacy.en.md`、`third-party/`（清单快照、许可证文本、字体与素材授权记录）、`scripts/generate-license-inventory.mjs`、`scripts/check-license-inventory.mjs`。
- 修改文件：`README.md`、`README.en.md`、`package.json`（新增 `licenses:generate` / `licenses:check` 脚本）、`.github/workflows/ci.yml`（新增门禁步骤）、`src-tauri/tauri.conf.json`（`licenseFile` + `resources`）、`src/styles/variables.css`、`src/export/theme/fonts.ts`、`src/export/theme/base.ts`。
- 二进制变更：`src/assets/fonts/SourceHanSerifSC-{Regular,Bold}-common.woff2` 重新生成（内部族名改为 `MarkFlow Serif SC`，字形与码位不变）。
- 不改变运行时行为，除中文字体族名标识外无功能差异；无新增运行时依赖（生成脚本只用 Node 标准库与 `cargo metadata`）。
- 合规门禁只做静态校验，不访问网络，因此可在 `web-checks` job 内运行。
