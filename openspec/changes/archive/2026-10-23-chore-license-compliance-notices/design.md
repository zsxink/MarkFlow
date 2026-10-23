# Design

## Context

动机见 `proposal.md` — Why。当前状态与约束：

- 仓库无 `LICENSE`，`README.md` / `README.en.md` 只在末尾写 "MIT"，GitHub API `licenseInfo` 为 `null`。
- 生产 npm 依赖 240 条（`package-lock.json`），Rust 依赖树 587 条（`src-tauri/Cargo.lock`，与 `cargo metadata --all-features` 完全一致）。
- npm 侧有 1 条缺 `license` 字段（`khroma`，包内 `license` 文件为 MIT）；9 条包内许可证文件名不规范（`LICENSE_MIT`、`LICENSE.markdown`）或完全缺失（`fastdom`、`hash.js`、`isarray`、`punycode.js`）。
- Rust 侧许可证分布复杂：`MIT OR Apache-2.0` 系列占多数，另有 `MPL-2.0`（cssparser/selectors/dtoa-short/option-ext）、`Unicode-3.0`（icu_*）、`CC0-1.0`（notify）、`CDLA-Permissive-2.0`（webpki-roots）、`Apache-2.0 WITH LLVM-exception`（windows 系列）。
- 字体：
  - Source Serif 4 = 上游 `4.005R` 桌面 TTF 的纯 woff2 封装。实测：除 `DSIG` 被丢弃、`head.checkSumAdjustment` 与 `head.flags` 重算外，其余表与上游逐字节一致，`name` 表完全相同。
  - Source Han Serif SC = 上游 `2.003R` OTF 的 GB2312 Level 1 子集（4193 码位 / 7322 字形）。实测：字形轮廓与度量在全部 4193 码位上与上游一致，但 `name` 表被裁剪（丢掉了 id 7/8/9/10/11/13/14），id 1/4/6 仍是 `Source Han Serif SC`。
  - 两份 OFL 文本已在 `src/assets/fonts/` 内，但未随发行包提供。
- 图形素材：图标、字标、DMG 背景图均为项目原创（背景图有 `assets/dmg-background.svg` 设计源 + `scripts/build-dmg-background.mjs` 生成器）；工具栏图标派生自 Feather Icons（MIT），但仓库无该许可证文本。
- 产品内已有 PlantUML 隐私警告（`src/ui/settings/markup.ts`），但用户文档完全没有数据流说明。
- `bundle.licenseFile` 与 `bundle.resources` 目前均未设置。

## Goals / Non-Goals

**Goals:**

- 合规状态可**再生**：任何人改完依赖后跑一条命令即可刷新清单，跑另一条命令即可知道清单是否过期。
- 门禁**离线**：不查网、不装新工具，能在 `web-checks` job 的 10 分钟预算内跑完。
- 字体授权**可追溯**：从上游发布标识到本地产物的校验值链路完整，且 OFL 保留字体名条款有明确结论。
- 发行包内用户**能拿到**许可证文本，而不只是仓库里能看到。

**Non-Goals:**

- 不做法律意见，不判断 MPL-2.0 / CDLA 等许可证的具体义务边界，只保证文本与声明随包可得、清单可审查。
- 不改 `npm audit` / `cargo audit` 的漏洞门禁（已由 `dep-audit-ci` 覆盖）。
- 不引入新的 npm / Rust 依赖，不引入 SPDX 工具链（`license-checker`、`cargo-about`、`cargo-deny` 都需要额外安装或联网解析）。
- 不重做字体的字形设计，不改变字体覆盖范围或包体预算。
- 不改产品内既有的 PlantUML 警告文案（只新增文档说明）。

## Decisions

### 决策 1：自研零依赖清单生成器，而非引入 `license-checker` / `cargo-about` / `cargo-deny`

`license-checker` 需要额外 devDependency；`cargo-about` 需要 `cargo install`（CI 里要编译几分钟，超出 `web-checks` 预算，也会打破"离线"约束）；`cargo-deny` 依赖 advisory 数据库网络访问。

选择 Node 标准库 + `cargo metadata --format-version 1`：

- `cargo metadata` 只读本地 registry 缓存，`--all-features --offline` 在缓存完整时可用；本项目已缓存全部 587 个 crate（CI 的 `Swatinem/rust-cache` 同样会缓存）。
- npm 侧只读 `package-lock.json` + `node_modules/<pkg>/package.json`，与 `check-layering.mjs`、`check-archive-synced.sh` 的自研脚本风格一致。
- 代价：需要自己解析 SPDX 表达式与许可证文本文件命名，约 300 行。可接受，因为规则本身简单且已在 `license-compliance` spec 中固定。
- 门禁按来源拆成 `--npm` / `--cargo` 两个入口，分别落在能提供对应工具链的 CI job（见 Risks 第 2 条）。

**Alternative**：把清单写成静态文件手工维护。否决——依赖升级后必然过期，且无法在 CI 里检测过期。

### 决策 2：清单分"快照 + 渲染"两层

`third-party/inventory.npm.json` 与 `third-party/inventory.cargo.json` 是逐条记录的机器可读快照（含许可证标识、文本文件路径、校验值）；`THIRD-PARTY-NOTICES.md` 是由快照渲染的人类可读通知。

- 快照进版本库 → diff 可审查（升级依赖时能看到许可证变化）。
- 门禁只需比对"重新生成的快照 == 提交的快照"，实现简单且能捕获遗漏。
- 渲染层可自由调整排版而不影响门禁语义。

**Alternative**：只提交渲染后的 Markdown。否决——无法可靠地做机器比对（排版变化会产生噪声 diff）。

### 决策 3：许可证文本按 SPDX 标识去重存放

`third-party/texts/<SPDX-ID>.txt`（如 `MIT.txt`、`Apache-2.0.txt`、`OFL-1.1.txt`、`MPL-2.0.txt`、`Unicode-3.0.txt`、`CDLA-Permissive-2.0.txt`、`CC0-1.0.txt`、`BSD-3-Clause.txt` 等），逐条依赖在快照里指向这些文件。

- 去重后文本数量约 12 个，`bundle.resources` 只需带一个目录。
- 每条依赖的**版权行**各不相同，所以渲染层在 `THIRD-PARTY-NOTICES.md` 里逐条列出 `name@version — SPDX — 版权行`，文本目录只放许可证模板正文。
- 门禁检查：凡是出现在依赖集合中的许可证标识，都必须有对应文本文件。

**Alternative**：每条依赖单独存一份完整文本（`third-party/texts/<pkg>-<version>/LICENSE`）。否决——体积膨胀（587 + 240 份），且绝大多数内容重复。

### 决策 4：允许清单显式声明，未知许可证默认失败

允许清单固定为当前实际出现的集合：

| 类别 | 标识 |
|---|---|
| npm | MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, Unlicense, BlueOak-1.0.0, Python-2.0, (MIT AND Zlib), (MIT OR GPL-3.0-or-later), (MPL-2.0 OR Apache-2.0), Apache-2.0 OR MIT, MIT OR Apache-2.0 |
| Rust | MIT, MIT OR Apache-2.0, Apache-2.0, Apache-2.0 OR MIT, BSD-2-Clause OR Apache-2.0 OR MIT, BSD-3-Clause, MPL-2.0, Unicode-3.0, Zlib, CC0-1.0, CDLA-Permissive-2.0, Apache-2.0 WITH LLVM-exception, Unlicense OR MIT, 0BSD OR MIT OR Apache-2.0, 等 |

失败即报错而不是警告，因为新增未知许可证正是需要人看一眼的时机。允许清单本身放在脚本常量里并附注释说明每条的法律类别，便于 review。

**关键处理**：`(MIT OR GPL-3.0-or-later)`（jszip）与 `(MPL-2.0 OR Apache-2.0)`（dompurify）、`MIT OR Apache-2.0 OR LGPL-2.1-or-later`（r-efi）是**双/多许可证选择**。项目按 MIT / Apache-2.0 分支使用，因此清单记录原始 SPDX 表达式 + 一列 `chosen`（项目实际采用的许可证），并在 `THIRD-PARTY-NOTICES.md` 里注明选择依据。这是 Issue #339 里"重点核实双许可证依赖"的落点。

### 决策 5：Source Han Serif 子集必须改名，Source Serif 4 保留原名

依据 OFL-FAQ（`openfontlicense.org`，1.1-update7）：

- 2.2.1：woff 转换若只做压缩、且 WOFF 元数据不新增/不篡改原字体元数据，则不构成 Modified Version，可继续用保留字体名。
- 2.6：**子集化（移除字形或 smart code）构成 Modified Version**，此时不应继续使用保留字体名。
- 5.4：不得完整使用保留字体名中的任何**单词**。Adobe 声明的 RFN 是 `Source`，所以 `Source Han Serif SC` 中的 `Source` 一词不可用于 Modified Version。

结论：

- Source Serif 4（纯封装）→ 保留 `Source Serif 4` 族名。已在 `third-party/fonts/PROVENANCE.md` 记录逐表比对结论作为依据。
- Source Han Serif SC 子集（Modified Version）→ 族名改为 `MarkFlow Serif SC`。内部 `name` 表 id 1/4/6 同步改名，id 0 版权行保留（OFL 要求不得移除版权声明），并新增一行说明这是子集版本、非上游原版。
- 同步改动：`src/styles/variables.css`（`@font-face` 与 `--font-serif`）、`src/export/theme/fonts.ts`（HTML 导出的内联字体族名）、`src/export/theme/base.ts`（导出主题的 eastAsia 字体栈）。

**Alternative**：保留族名并在文档里"声明"合规。否决——这恰好是 Issue 要求核实的条款，不应靠自我声明绕过。

**Alternative**：改用系统字体，删除内置中文字体。否决——`font-stack` 明确要求非 Mac 平台内置中文回退，删除会破坏跨平台一致性且超出本 Issue 范围。

### 决策 6：字体二进制重生成走 Python/fontTools，产物入库

`scripts/regenerate-cjk-font-subset.py` 记录子集化与改名流程（`pyftsubset` 参数 + `name` 表改写），产出的 woff2 直接提交。

- 生成脚本依赖 fontTools，**不进入 CI**，只在人工更新字体时运行（与 `scripts/build-dmg-background.mjs` 依赖 `sharp` 的既有做法一致）。
- 校验值写入 `third-party/fonts/PROVENANCE.md`，门禁只校验"文件校验值与记录一致"，不重新生成字体。

**Alternative**：在 CI 里重跑子集化并比对。否决——字体构建对 fontTools 版本敏感，且 33MB 上游字体不可能进 CI 缓存。

### 决策 7：隐私说明放在 `docs/`，并在 README 建入口

`docs/privacy.md` + `docs/privacy.en.md`，与 `README.md` / `README.en.md` 的既有中英双语模式一致。README 的"项目文档"表格新增一行指向隐私说明，许可证段落改为指向 `LICENSE` + `THIRD-PARTY-NOTICES.md`。

不把隐私说明塞进 README 正文：内容会随功能增长，README 已偏长，且 `readme-sync` spec 只约束功能清单与许可证段落。

### 决策 8：发行包通过 `bundle.licenseFile` + `bundle.resources` 携带文本

- `bundle.licenseFile: "../LICENSE"` → Tauri 把它放进 deb/rpm 的 `/usr/share/doc/<pkg>/copyright`、NSIS 的许可页、macOS 包的资源目录。
- `bundle.resources: { "../THIRD-PARTY-NOTICES.md": "", "../third-party/texts/": "" }` → 落到 `$RESOURCES/`，用户可在安装目录直接读到。
- 不把 `third-party/inventory.*.json` 打进包（体积与可读性都不合适，仓库里有就够）。

## Risks / Trade-offs

- **[字体改名会破坏已有的导出 HTML 或用户自定义 CSS]** → 内置字体只在应用内与导出 HTML 的内联 `@font-face` 中使用，用户无法持久化引用族名；`--font-serif` 的回退链仍保留 `Source Han Serif SC`（系统若装了上游字体仍可命中）。已在 `font-stack` spec 中把改名写成不变量。
- **[`cargo metadata` 需要 Rust 工具链与 registry 缓存，而 `web-checks` job 两者都没有]** → 门禁脚本按来源拆成两个入口：`--npm` 只读 `package-lock.json` + `node_modules/`（`npm ci` 之后即可用），放在 `web-checks`；`--cargo` 调用 `cargo metadata --all-features`，放在 `rust-checks`（该 job 已装 Rust 且有 `Swatinem/rust-cache`，`cargo test` 之前 metadata 必然可解析）。两个 job 各跑自己的一半，不引入新的网络或缓存依赖，也不违反 `ci-runtime-budget` 的 job 隔离。
- **[子集字体重新生成后可能与原字体渲染有细微差异]** → 子集化只删字形不改轮廓；本次只改 `name` 表，字形数据完全不变（`pyftsubset` 的 `--no-subset-tables` 等价处理），风险接近零。`npm test` 中导出主题测试会校验字体族名，可捕获漏改。
- **[清单文件体积]** → 快照 827 条记录，每条约 6 个字段，约 200KB JSON；Markdown 通知约 400KB。可接受（相比 `package-lock.json` 的 1.1MB）。若过大可后续按许可证分组折叠，不影响门禁。
- **[门禁会因上游依赖改许可证而突然失败]** → 这正是设计意图；失败信息给出依赖名与标识，修复方式是 review 后更新允许清单，成本可控。

## Migration Plan

1. 新增 `LICENSE`、`docs/privacy*.md`、`third-party/`、两个脚本。
2. 重生成两个 CJK 字体（族名改名），同步 CSS 与导出模块。
3. 更新 `README.md` / `README.en.md` / `package.json` / `src-tauri/tauri.conf.json` / `.github/workflows/ci.yml`。
4. 回滚策略：本变更不改运行时数据格式，`git revert` 即可；唯一不可逆的是字体文件二进制（需保留旧文件备份，见 `PROVENANCE.md` 中的旧校验值记录）。

## Open Questions

- 无。
