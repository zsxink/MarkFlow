## Context

二期（#247/#250）已归档 umbrella charter（`2026-07-31-typora-grade-live-preview-phase2`）只作为 program charter，R0-R5 拆分为独立 child Issue/branch/OpenSpec change（见 `02-multi-stage-implementation-plan.md`）。R0A 是第 1 个工作包，负责建立"完成"的可审计状态。

现状问题：

- `markflow-core/fixtures/` 已有 `lossless/`（BOM、EOL、fence、table、Unicode 等）与 `size/`（1/10/50 MiB），但无 manifest/hash，无法证明 fixture 版本一致性。
- `scripts/check-capabilities.sh` 只做 Tauri capability 安全配置检查，不解析 capability matrix。
- evidence 目录约定、archive honesty check 均不存在；required gate 是否执行只能靠自由文本。
- `docs/markflow-core-phase2/` 状态语言已声明 charter archived，但无机器可读的追踪源。
- 既无 feature flag/rollback matrix，也无 release-gate ADR 与 benchmark/visual/IME/widget/observation manifests。

约束（来自 `01-review-and-feasibility.md` 与 `03-acceptance-and-manual-test-plan.md`）：

- R0 不改产品编辑行为；仅增加不含文档内容的可观测性日志字段。
- R0 总验收 A1/A2/A5/A7 ADR 批准后 R1/R2 才可开始。
- 自动验收：每 umbrella task 唯一 child owner；manifests 可脚本解析；fixture hash 与日志位置可重复生成；`npm run validate:openspec` 与 archive honesty check 通过。
- 人工验收 `M-R0-01..03`。

## Goals / Non-Goals

**Goals:**

- 建立 canonical fixture manifest，覆盖 proposal 所列语法、EOL、BOM 与 size 类别，hash 可重复生成。
- 建立 machine-readable capability/evidence matrix，可被脚本解析，required evidence 不能被自由文本伪造。
- 固定 evidence 目录 `stage/case/platform/revision/timestamp`，并在 git 之外保留可引用 URI。
- 建立 archive honesty check：evidence 为空、revision 不匹配或 required gate 未执行时失败。
- 冻结每阶段 feature flags、默认值、fallback、删除时间。
- 产出 release-gate ADR 与 benchmark/visual/IME/widget/observation manifests。
- 收敛 tasks `1.1-1.7`、`2.10` 唯一归属本 child。

**Non-Goals:**

- 不实现任何 parser、编辑器或产品行为（属 R0B+）。
- 不改动产品 save/history/render 逻辑（属 R0C）。
- 不创建 ProseMirror/Tiptap 依赖或 serializer/DOM save fallback。
- 不改变既有 size filler 文件（1/10/50 MiB）的提交状态；它们继续直接提交进 git。
- 不自动同步 evidence 到远程；evidence 保持本地目录 + manifest 引用。

## Decisions

### 1. Canonical fixture 布局与 manifest

统一在既有 `markflow-core/fixtures/` 下维护二期 canonical fixtures（原 `fixtures/` 仓库根目录不保留，全部合并进来）：

```text
markflow-core/fixtures/
  README.md                    # 目录语义、类别说明
  manifest.json                # machine-readable；每文件 hash + category + 用途
  lossless/                    # 既有 Core 无损保真测试输入 + 二期 canonical 场景
    lf.md crlf.md mixed-eol.md utf8-bom.md trailing-newlines.md
    frontmatter.md frontmatter-rich.md
    html-comment.md html-raw.md
    code-fence-backtick.md code-fence-tilde.md
    mixed-list-markers.md table-alignment.md unicode-offsets.md
    commonmark-basic.md gfm-extensions.md cjk-unicode.md
    malformed-syntax.md nested-structures.md gfm-table.md
    image-links.md diagram-fences.md
  size/                        # 1mb-filler/10mb-filler/50mb-filler（直接提交 git）
```

决策要点：

- 二期 canonical fixtures 直接合入 `markflow-core/fixtures/lossless/`（Core roundtrip 测试逐字节校验全部 `.md` 文件），不单独建仓库根 `fixtures/`。
- `manifest.json` 记录 `category`、`source`（`canonical` = 二期新建场景，`core` = Core 既有 lossless 文件）与 `sha256`。
- size 大文件（1/10/50 MiB filler）直接提交进 `markflow-core/fixtures/size/`，`manifest.json` 记录其 `sha256` 与字节大小；honesty check 对全部文件重算 hash。
- `manifest.json` 使用 JSON Schema（`scripts/schemas/fixture-manifest.schema.json`），`scripts/check-fixtures.sh` 校验 schema + 重算 hash。
- `npm run validate:openspec` 门禁追加 `scripts/check-fixtures.sh` 调用（见 Decision 5）。

### 2. Capability/evidence matrix 与 schema

新增 `openspec/capabilities/`（repo 根）放 machine-readable matrix：

```text
openspec/capabilities/
  matrix.json                  # 每能力一行：owner、child change、flag、states、evidence URIs
  matrix.schema.json
  requirements.json            # umbrella task -> child change -> owner 唯一归属
```

`matrix.json` 结构：

```json
{
  "schemaVersion": 1,
  "capabilities": [
    {
      "id": "visual-release-gate",
      "owner": "@xian",
      "childChange": "r0a-baseline-governance",
      "flag": "wysiwyg.livePreview.v2",
      "default": false,
      "states": {
        "notStarted": true,
        "implemented": true,
        "automatedVerified": false,
        "desktopVerified": false,
        "visualVerified": false,
        "imeVerified": false,
        "platformVerified": false,
        "productAccepted": false
      },
      "evidence": {
        "unit": ["docs/markflow-core-phase2/evidence/.../unit/pass.json"],
        "integration": [],
        "desktop": [],
        "visual": [],
        "ime": [],
        "platform": [],
        "observation": []
      }
    }
  ],
  "tasks": [
    { "task": "1.1", "owner": "@xian", "childChange": "r0a-baseline-governance" }
  ]
}
```

决策要点：

- matrix 的 capability 集合从 `openspec/specs/` 读取生成（每个 spec 一个 capability），避免手写漂移；`scripts/sync-capability-matrix.sh` 生成，`scripts/check-capability-matrix.sh` 校验。
- 状态词汇严格使用 `03-acceptance-and-manual-test-plan.md` 的八级词汇；校验脚本拒绝未知状态值。
- 只有状态为 `true` 时要求对应 evidence 非空；`productAccepted` 之前所有层必须先通过。这与验收手册"后层不能由前层替代"一致。
- task 唯一归属：同一 task id 在 `requirements.json` 只出现一次；跨 child 依赖用 `dependsOn` 表达而非重复 owner。

### 3. Evidence 目录与 revision 约定

固定 evidence 目录：

```text
docs/markflow-core-phase2/evidence/
  <stage>/<case>/<platform>/<revision>/<timestamp>/
    evidence.json               # 机器可读：case id、operator、commit SHA、flags、环境
    screenshot.png / trace.json / app.log  # 按需
  INDEX.json                    # 全量证据索引（引用 above 相对路径）
```

决策要点：

- `stage` = `r0a`、`r0b`...；`case` = 人工/自动验收 case id（如 `M-R0-01`、`unit`、`visual`）；`platform` = `macos`/`windows`/`linux`/`ci`；`revision` = git commit SHA 或 build revision；`timestamp` = ISO-8601。
- `evidence.json` 的字段对齐 `03-acceptance-and-manual-test-plan.md` §2：case id、结果、操作者、commit SHA、build profile、flags、OS/WebView/IME/locale/theme/scale/viewport、fixture 名与初始 hash、时间、artifact 路径、保存后 hash、trace（性能）。
- 截图/日志等大文件在 `.gitignore` 中排除；`INDEX.json` 与 `evidence.json` 入库。honesty check 按 `INDEX.json` 校验每个引用文件存在。
- PASS 必须来自当前 commit；`revision` 字段与 HEAD SHA 不匹配即 stale evidence，honesty check 失败（对本地，从 HEAD 读取）。

### 4. Archive honesty check

新增 `scripts/check-evidence-honesty.sh`，作为 archive 前 required gate（并入 `check-archive-synced.sh` 或单独调用，决策：单独脚本，由 `npm run validate:openspec` 和 archive 前手动执行）：

检查项：

1. `openspec/capabilities/matrix.json` 可解析且 schema 通过。
2. 每个状态为 `true` 的能力其 required evidence 引用在 `INDEX.json` 中且文件存在。
3. `INDEX.json` 中每条 evidence 的 `revision` 等于当前 HEAD；否则 stale。
4. 每个 task 在 `requirements.json` 有唯一 owner；child change 目录存在。
5. `markflow-core/fixtures/manifest.json` 中所有文件存在且 hash 匹配。
6. required gate（`npm test`、`tsc`、GUI/visual/IME/platform/observation）中标记为 PASS 的能力必须有对应 evidence URI；无 evidence 的 PASS 视为伪造。

失败时输出具体字段与文件，exit non-zero。

### 5. CI 与 npm script 集成

- `package.json`：`validate:openspec` 扩展为顺序执行 `openspec validate --all`、`scripts/check-fixtures.sh`、`scripts/check-capability-matrix.sh`、`scripts/check-evidence-honesty.sh`（honesty 在 archive 前手动运行，避免开发期 HEAD 变动导致 CI 常失败——决策：CI 只在 PR 包含 archive 目录时运行 honesty，否则跳过）。
- `.github/workflows/ci.yml`：在现有 `Check archived changes are synced to main specs` 后追加 fixture/capability 检查步骤。
- 新增脚本统一入口：`scripts/check-*.sh` 遵循现有 bash 风格（`set -euo pipefail` + `ROOT="$(cd "$(dirname "$0")/.." && pwd)"`）。

### 6. Feature flags 与 rollback matrix

新增 `docs/markflow-core-phase2/flags.md`（人读）+ `openspec/capabilities/flags.json`（机器读，含 schema）。

每 flag 字段：

```json
{
  "id": "wysiwyg.livePreview.v2",
  "stage": "r2a",
  "default": false,
  "fallback": "exact-source-projection",
  "deleteAfter": "2027-01-01 or milestone",
  "owner": "r2b child"
}
```

决策要点：

- `fallback` 只允许 `exact-source-projection`；禁止 `serializer`、`dom-save`、`prosemirror` 值。校验脚本枚举合法值。
- `deleteAfter` 是删除时间（里程碑或日期），honesty check 校验已过删除时间的 flag 未被使用。
- rollback 行为与 `README.md` §11.2 对齐：R0/R1 Source Mode default；R2 按 construct 回退 source；R3 按 block 回退 source。

### 7. Release-gate ADR 与 manifests

新增 `docs/markflow-core-phase2/adr/`（沿用 `2026-07-27-define-m0-architecture-baseline/adr/` 格式）：

```text
docs/markflow-core-phase2/adr/
  adr-release-gate-r0.md       # R0 required gate 与 evidence 边界（task 2.10）
  adr-widget-p0-scope.md       # structured widget P0/P1 发布范围
```

manifests 入 `openspec/capabilities/manifests/`：

```text
benchmark.manifest.json        # reference hw/sw、build profile、fixture、边界、warm-up、样本、重复、噪声
visual.manifest.json           # OS/WebView/font/theme/scale/viewport/animation/pixel threshold/ratio/masks
ime.manifest.json              # IME evidence 边界（自动 vs 签名人工）
widget-scope.json              # P0/P1 widget 范围
observation.manifest.json      # 7 天/20 小时、每平台每 workflow >=3 次、日志完整性
```

决策要点：

- 这些 manifest 是冻结参数，R0 批准后成为后续阶段 required gate 依据（与 `visual-release-gate` spec 的 benchmark/visual/IME/observation requirement 对齐）。
- ADR 状态字段沿用 `Status: Accepted for R0 baseline`；含 Evidence 与 Upgrade Gate 段。

### 8. 文档状态语言收敛（task 1.3）

- `docs/markflow-core-phase2/README.md`：状态语言已声明 charter archived；补充一行指向 `openspec/capabilities/matrix.json` 作为机器可读追踪源，明确"charter 已归档"≠"产品已验收"。
- 更新 `docs/markflow-core-phase2/04-traceability-matrix.md`：引用 `requirements.json` 作为唯一归属源。
- 不修改已归档 umbrella checklist；实现状态写入独立 tracking（即 `matrix.json`）。

## Risks / Trade-offs

- [50 MiB 大文件入库导致 repo 体积增大] -> 沿用既有提交状态（filler 文件已入库），manifest 记录 hash 保证版本一致；CI 直接校验 hash。
- [evidence 目录入库导致 repo 膨胀] -> 截图/日志/trace gitignore；只入库 `INDEX.json`/`evidence.json`；artifact 保留本地。
- [honesty check 对 HEAD SHA 敏感，开发期常失败] -> CI 仅在 PR 含 archive 目录时运行；本地开发用 `--revision <sha>` 覆盖。
- [capability matrix 从 specs 生成可能漏新 spec] -> `sync-capability-matrix.sh` 与 `check-capability-matrix.sh` 都从 `openspec/specs/` 扫描，漏 spec 会以 diff 失败提示。
- [自由文本仍可能侵入 evidence] -> schema 枚举 + 非空校验 + 引用文件存在校验三重复合；人工验收 `M-R0-02` 反向抽查。

## Migration Plan

1. 建 `markflow-core/fixtures/` manifest/schema；写 `check-fixtures.sh`。
2. 建 `openspec/capabilities/` 与 matrix/requirements/flags schema + sync/check 脚本。
3. 建 evidence 目录与 `INDEX.json` 模板；写 `check-evidence-honesty.sh`。
4. 产 `adr-release-gate-r0.md`、`adr-widget-p0-scope.md` 与 5 个 manifests。
5. 更新 `docs/markflow-core-phase2/` README/追踪矩阵引用；`package.json`、CI。
6. 记录 R0 baseline report（task 1.5）：当前 build revision、已知日志错误、复现步骤、截图路径。

回滚：仅回滚治理脚本与文档，不删除已采集 evidence 与 fixture。

## Open Questions

- P0/P1 widget 范围的最终边界（`adr-widget-p0-scope.md` 批准前冻结）。
- visual runner 选型（Playwright vs WebdriverIO screenshots）会影响 `visual.manifest.json` 的 runner 字段，R0 内定稿。
- CI 环境能否提供稳定中文 IME 自动化：`ime.manifest.json` 需划分自动与签名人工边界。
