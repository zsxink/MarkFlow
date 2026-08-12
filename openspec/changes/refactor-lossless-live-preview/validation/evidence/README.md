# Evidence 目录

状态：EMPTY

目录格式：`evidence/<phase>/<run-id>/`。

每个 run 至少包含 `RUN.md`、命令原始输出、fixture hash/diff report、脱敏日志和 artifact manifest。desktop/visual 阶段还包含截图或录屏索引。文件名必须描述命令或工作流，不使用无法追踪的 `output.txt`。

证据在阶段 Go 后计算 manifest SHA-256。需要长期保存的证据迁入 CI artifact 或 child change；本目录属于临时工作区，不是永久归档。
