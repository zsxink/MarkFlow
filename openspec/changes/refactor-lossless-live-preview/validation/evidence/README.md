# Evidence 目录

状态：ACTIVE。P0S 已有首轮 run `20260813-031727-p0s-legacy-no-edit-guard` 与纠偏 run
`20260813-100918-p0s-immediate-transaction-guard`；历史 run 不回写，纠偏结果使用新 run-id。

目录格式：`evidence/<phase>/<run-id>/`。

每个 run 至少包含 `RUN.md`、命令原始输出、fixture hash/diff report、脱敏日志和 artifact manifest。desktop/visual 阶段还包含截图或录屏索引。文件名必须描述命令或工作流，不使用无法追踪的 `output.txt`。

证据在阶段 Go 后计算 manifest SHA-256。需要长期保存的证据保留在 umbrella change 或迁入 CI artifact；大型原始产物可位于临时工作区，但其 RUN、manifest、hash 和结论必须版本化。
