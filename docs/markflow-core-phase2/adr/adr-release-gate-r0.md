# ADR: R0 Required Gate 与 Evidence 边界

- Status: Accepted for R0 baseline
- Date: 2026-07-31
- Evidence: `openspec/capabilities/matrix.json`, `openspec/capabilities/manifests/benchmark.manifest.json`, `openspec/capabilities/manifests/visual.manifest.json`, `openspec/capabilities/manifests/ime.manifest.json`, `openspec/capabilities/manifests/widget-scope.json`, `openspec/capabilities/manifests/observation.manifest.json`, `docs/markflow-core-phase2/evidence/`

## Decision

R0 之后的每个 child change 在 archive 前必须满足 machine-readable required gate，
由 `scripts/check-evidence-honesty.sh` 强制执行，不能只靠自由文本声明完成。

### Required gate（R0 起冻结）

1. **通用 gate**：`npm audit --omit=dev --audit-level=high`、`npm test`、
   `npx tsc --noEmit`、`scripts/check-capabilities.sh`、
   `npm run validate:openspec`、`bash scripts/check-archive-synced.sh`、
   `npm run build`、`bash scripts/check-bundle-size.sh`（验收手册 §3）。
2. **Rust/Tauri**：`cargo test`、`cargo fmt --check`、`cargo clippy -D warnings`。
3. **Core**：`cargo test`、`cargo clippy`（涉及 Core 的 child）。
4. **二期新增**：`npm run test:e2e`、`npm run test:e2e:regression`；
   visual/performance 命令在 manifest 冻结后成为 required gate。
5. **GUI/visual/IME/platform/observation**：只能由当前 commit 的真实桌面证据
   标记通过；CI 环境不足不能勾选，必须保持 blocker。

### Evidence 边界

- PASS 必须来自当前 commit（evidence `revision` == HEAD），旧截图/旧日志/不同
  flag 组合均为 stale evidence。
- 每个标记为 true 的 capability 状态必须有对应 evidence URI；无 evidence 的
  PASS 视为伪造，honesty check 失败。
- evidence 目录固定为 `docs/markflow-core-phase2/evidence/<stage>/<case>/<platform>/<revision>/<timestamp>/`，
  `INDEX.json` 索引全部条目；引用文件缺失即失败。
- 截图/日志/trace 大文件不入库（gitignore），只入库 `INDEX.json`/`evidence.json`；
  artifact 保留本地并在 evidence 中引用路径。

### Upgrade Gate

以下任一情况阻塞 R1/R2 开工（R0 总验收 A1/A2/A5/A7）：

- 任何 parser range、真实 invoke 或 degraded recovery 失败；
- release-gate ADR 与 5 个 manifests 未批准；
- 任一 required evidence 没有 owner 或可复现环境。

### 冻结 manifests

- `benchmark.manifest.json`：reference hw/sw、build profile、fixture、测量边界、
  warm-up、样本、重复、噪声策略。
- `visual.manifest.json`：OS/WebView/font/theme/scale/viewport/animation/
  pixel threshold/ratio/masks。
- `ime.manifest.json`：自动 vs 签名人工 evidence 边界。
- `widget-scope.json`：P0/P1 widget 范围。
- `observation.manifest.json`：7 天/20 小时、每平台每 workflow >= 3 次、日志完整性。

上述 manifest 由 `scripts/check-capability-matrix.sh` 校验必填字段；后续阶段把
预算变成 gate 时必须引用对应 manifest。
