# Evidence 目录

状态：ACTIVE。P0S 已有首轮 run `20260813-031727-p0s-legacy-no-edit-guard` 与纠偏 run
`20260813-100918-p0s-immediate-transaction-guard`；历史 run 不回写，纠偏结果使用新 run-id。

P1A（最小 Lossless Core）：
- `P1A/20260813-p1a-core-0967a06/` — 历史 candidate run（AI gates + 首个 Reviewer CONDITIONAL PASS；已 superseded）。
- `P1A/20260814-p1a-corrective-core/` — corrective candidate `9ad0513`：自动化修复 + gate 全过 + 独立 Reviewer **PASS**。
- `P1A/20260814-p1a-final-9ad0513/` — corrective 并发独立终审：独立 harness + Reviewer **GO**（P2 transaction-id 保留窗口留 P1B）。
  人工验收与 Program Owner Go/No-Go 仍 PENDING。

目录格式：`evidence/<phase>/<run-id>/`。

每个 run 至少包含 `RUN.md`、命令原始输出、fixture hash/diff report、脱敏日志和 artifact manifest。desktop/visual 阶段还包含截图或录屏索引。文件名必须描述命令或工作流，不使用无法追踪的 `output.txt`。

证据在阶段 Go 后计算 manifest SHA-256。需要长期保存的证据保留在 umbrella change 或迁入 CI artifact；大型原始产物可位于临时工作区，但其 RUN、manifest、hash 和结论必须版本化。
