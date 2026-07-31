## 1. Canonical Fixtures (task 1.1)

- [x] 1.1 在 `markflow-core/fixtures/` 下合并 canonical 目录结构与 `README.md`，说明 canonical 与 core 来源语义
- [x] 1.2 建立 canonical fixtures 到 `markflow-core/fixtures/lossless/`：commonmark、gfm、cjk、malformed、nested、table、frontmatter、image、diagram、html 类别（每个类别至少一个 fixture）
- [x] 1.3 建立 eol 类别：lf、crlf、mixed-eol、utf8-bom
- [x] 1.4 将 1/10/50 MiB size filler 纳入 `markflow-core/fixtures/size/`（直接提交 git），在 manifest 记录 hash 与字节大小
- [x] 1.5 编写 `scripts/schemas/fixture-manifest.schema.json` 与 `markflow-core/fixtures/manifest.json`（含 category、source、sha256）
- [x] 1.6 编写 `scripts/check-fixtures.sh`（schema 校验 + 全部文件 hash 重算比对）
- [x] 1.7 运行 `scripts/check-fixtures.sh` 并确认全部通过；size filler 直接提交 git 并被 manifest 记录 hash

## 2. Capability Matrix and Task Ownership (tasks 1.2, 1.7)

- [x] 2.1 编写 `scripts/schemas/capability-matrix.schema.json`（states 八级词汇、evidence 字段、flag、owner、childChange）
- [x] 2.2 编写 `scripts/sync-capability-matrix.sh`：从 `openspec/specs/` 扫描 capability 集合，生成 `openspec/capabilities/matrix.json`
- [x] 2.3 初始化 `openspec/capabilities/matrix.json`（覆盖 16 个 phase-2 capability，状态默认 notStarted）
- [x] 2.4 编写 `openspec/capabilities/requirements.json`（task 1.1-1.7、2.10 唯一 owner=r0a-baseline-governance；全部 1.1-12.10 归属后续 child 或本 child）
- [x] 2.5 编写 `scripts/check-capability-matrix.sh`（schema、capability 集完整性、task 唯一 owner、passed state 需 evidence、productAccepted 前置层）
- [x] 2.6 运行 `scripts/check-capability-matrix.sh` 并确认通过

## 3. Evidence Directory and Honesty Check (task 1.4)

- [x] 3.1 创建 `docs/markflow-core-phase2/evidence/` 目录结构与 `INDEX.json` 模板
- [x] 3.2 编写 evidence schema（case id、result、operator、commit SHA、build profile、flags、环境字段、fixture hash、时间、artifact 路径）
- [x] 3.3 编写 `scripts/check-evidence-honesty.sh`（schema、引用文件存在、revision==HEAD、passed state 需 evidence URI）
- [x] 3.4 编写单元用例覆盖：空 evidence、stale revision、缺失文件、伪造 PASS
- [x] 3.5 在 `.gitignore` 排除截图/日志/trace 大文件，保留 `INDEX.json` 与 `evidence.json`

## 4. Feature Flags and Rollback (task 1.6)

- [x] 4.1 编写 `docs/markflow-core-phase2/flags.md`（每 flag：id、stage、default、fallback、deleteAfter、owner）
- [x] 4.2 编写 `openspec/capabilities/flags.json` 与其 schema（fallback 仅允许 `exact-source-projection`）
- [x] 4.3 在 `scripts/check-capability-matrix.sh` 中追加 flags 校验（schema、fallback 枚举、过期删除）
- [x] 4.4 运行校验确认 flags 通过

## 5. Release-Gate ADR and Manifests (task 2.10)

- [x] 5.1 编写 `docs/markflow-core-phase2/adr/adr-release-gate-r0.md`（R0 required gate 与 evidence 边界）
- [x] 5.2 编写 `docs/markflow-core-phase2/adr/adr-widget-p0-scope.md`（structured widget P0/P1 发布范围）
- [x] 5.3 编写 `openspec/capabilities/manifests/benchmark.manifest.json`
- [x] 5.4 编写 `openspec/capabilities/manifests/visual.manifest.json`
- [x] 5.5 编写 `openspec/capabilities/manifests/ime.manifest.json`
- [x] 5.6 编写 `openspec/capabilities/manifests/widget-scope.json`
- [x] 5.7 编写 `openspec/capabilities/manifests/observation.manifest.json`
- [x] 5.8 在 `scripts/check-capability-matrix.sh` 中追加 manifests 校验并确认通过

## 6. R0 Baseline Report (task 1.5)

- [x] 6.1 记录当前 binary revision（git SHA + build profile）到 `docs/markflow-core-phase2/evidence/r0a/baseline/macos/<revision>/<timestamp>/evidence.json`
- [x] 6.2 复现并记录已知 projection/日志错误：复现步骤、日志目录、截图路径
- [x] 6.3 记录受影响 fixtures 列表与初始 hash

## 7. Docs, CI, and Validate Integration (tasks 1.3, 1.7)

- [x] 7.1 更新 `docs/markflow-core-phase2/README.md`：链接 `openspec/capabilities/matrix.json`，明确 charter archived ≠ product accepted
- [x] 7.2 更新 `docs/markflow-core-phase2/04-traceability-matrix.md`：引用 `requirements.json` 作为唯一归属源
- [x] 7.3 更新 `package.json`：`validate:openspec` 依次执行 `check-fixtures.sh`、`check-capability-matrix.sh`、`check-evidence-honesty.sh`
- [x] 7.4 更新 `.github/workflows/ci.yml`：追加 fixture/capability/honesty 检查步骤（honesty 仅 PR 含 archive 时运行）
- [x] 7.5 运行 `npm run validate:openspec`、`npm test`、`npx tsc --noEmit` 确认全绿
- [x] 7.6 独立 agent 复核本 child diff 与 evidence 诚实性；复核结论：变更可接受，4 处建议级残留已修正
- [ ] 7.7 人工验收 `M-R0-01`、`M-R0-02`、`M-R0-03` 并记录证据（本分支 PR 合并后执行）
