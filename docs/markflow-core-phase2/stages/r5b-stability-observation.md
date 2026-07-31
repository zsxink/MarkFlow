# R5B：Current-build 稳定观察

## 目标

验证同一个 release candidate 在持续使用中没有 silent fallback、输入丢失、revision 分歧或泄漏。

## 范围

- OpenSpec task：`11.11`。
- 输入：R5A 全部通过后冻结的 release candidate。

## 观察协议

1. 记录 RC commit、artifact hash、flags、OS/WebView 和开始时间。
2. 连续 7 天、累计 20 小时。
3. 每个平台每个 canonical workflow 至少执行 3 次。
4. 保持日志连续，记录启动、A/B、输入、widget、save/export、close/reopen。
5. 阻塞事件：lost input、revision divergence、wrong-session result、silent fallback、
   session leak、panic、无法恢复的 degraded。
6. 修复阻塞事件后冻结新 RC，观察窗口从零重启。

## 验收

- 所有时间、平台和 workflow 配额满足。
- 无阻塞事件或未关闭异常。
- evidence 全部匹配同一 RC。
- 人工执行 `M-R5-05`。

## 回滚

观察失败则回到对应实现阶段修复，不得通过更换日志、缩短窗口或排除失败平台绕过。

## 前后依赖

- 前置：[R5A](./r5a-desktop-visual-platform.md)
- 后续：[R5C](./r5c-cleanup-archive.md)

