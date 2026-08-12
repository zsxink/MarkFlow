# Program 治理、证据与门禁设计

## 1. 目标

Issue #254 是跨多个版本的 program，不是单 PR。治理设计的目标是让每次迁移都可独立验证、可回滚、可追溯，并防止“测试很多但真实编辑器不可用”再次发生。

## 2. 角色和职责

| 角色 | 职责 | 不得做的事 |
| --- | --- | --- |
| 实现 AI | 阅读阶段设计、实现 scope、补测试、运行 AI gate、写验证记录 | 自己批准自己的最终 Go |
| 独立 Reviewer AI | 静态走查、验证合同、重跑关键测试、检查失败路径 | 依赖实现 AI 的口头摘要代替证据 |
| 人工验收人 | 在真实桌面按脚本操作、判断视觉与编辑手感、批准风险 | 修改代码来让候选版本临时通过 |
| Program Owner | 批准阶段边界、风险接受、默认 flag 与回滚 | 在关键证据缺失时宣布完成 |

实现 AI 与 Reviewer AI 必须是独立上下文。P1A、P1B、P3、P5 涉及数据一致性，Reviewer 必须检查完整 diff，并重跑 byte/hash 与保存冲突测试。

## 3. 阶段状态机

```text
Draft
  │ design reviewed
  ▼
Ready
  │ implementation starts
  ▼
Implementing
  │ AI gates pass
  ▼
AI-Verified
  │ independent review passes
  ▼
Review-Verified
  │ human script passes
  ▼
Human-Accepted
  │ program owner Go
  ▼
Complete
```

P4A parser spike 允许阶段专用完成态 `Spike-Complete-No-IR`：候选淘汰证据、ADR、Reviewer 和人工降级验证全部通过，但产品继续 local projection/source fallback。该状态视为 P4A 已治理完成，不代表 Core IR 实现完成；后续阶段必须把依赖 Core IR 的项标为不适用或保持 default-off。

任一状态出现数据损坏、错误写盘、跨文档污染、无法恢复的 blocked pipeline 或真实 UI 只显示源码，立即转为 `No-Go`。No-Go 后只能修复并从失败 gate 重新开始，不能跳过。

## 4. Child change 规则

每个 P 阶段至少建立一个 child change。P4B 中每个 marker cohort 或 widget 必须有独立 child change。child change 必须引用：

- parent Issue #254；
- 本阶段设计文档；
- 受影响 capability specs；
- `validation/phases/<phase>.md`；
- feature flag 与回滚路径。

一个 child PR 只允许一个可验收纵向目标。若 diff 同时改变 Core text model、编辑投影、save pipeline 和 UI shell，必须拆分，除非无法形成可运行切片且已由 Program Owner 书面批准。

## 5. 证据等级

| 等级 | 证据 | 可证明内容 |
| --- | --- | --- |
| E0 | 设计、类型、静态走查 | 接口意图和依赖边界 |
| E1 | unit/property/golden | 算法、边界和不变量 |
| E2 | bridge/integration | JS↔Rust、真实 dispatcher、session 生命周期 |
| E3 | desktop E2E | Tauri WebView、真实文件、用户工作流 |
| E4 | visual/IME/accessibility | 人可观察编辑体验和平台差异 |
| E5 | stability observation | 长时使用、性能和低频竞态 |

P0 至少需要 E1；P1A 需要 E1；P1B 需要 E1-E3；P2/P3/P4B 需要 E1-E4；P5 需要 E1-E5。

## 6. AI 验证通用要求

实现 AI 每次运行必须记录：

1. 仓库绝对路径、branch、commit SHA、dirty status；
2. OS、架构、Node/npm/Rust/Cargo/Tauri/WebView 版本；
3. feature flags 与测试配置；
4. 运行命令、开始/结束时间、退出码；
5. 测试数量、失败名称、重试次数；
6. fixture 输入/output SHA-256；
7. E2E artifact、截图、日志和 diff 路径；
8. 日志脱敏说明；
9. 未运行项和原因；
10. AI 的 Go/No-Go 建议。

AI 不得把失败命令重跑到偶然成功后只记录最后一次。flaky 必须记录所有尝试并作为问题进入 `issues/`。

## 7. 人工验证通用要求

人工验收必须使用 AI 已验证的同一 commit 和 flags。验收人需要记录：

- 姓名或可追踪标识、日期、设备和 OS；
- 使用的 fixture 与 hash；
- 每一步实际结果；
- 肉眼观察到的 selection、scroll、marker、IME、主题和错误提示；
- 是否产生意外 dirty、autosave 或磁盘变更；
- 阻塞问题编号；
- `Accept`、`Accept with recorded risk` 或 `Reject`。

人工 `Accept with recorded risk` 不能覆盖 byte fidelity、错误写盘、安全或跨文档污染问题。这四类问题只能 Reject。

## 8. Go/No-Go 规则

Go 必须同时满足：

- 阶段所有 MUST gate 通过；
- 无 P0/P1 数据完整性问题；
- 独立 Reviewer 已完成；
- 阶段要求人工参与时已签字；
- rollback 已实际演练或由 feature flag 证明；
- 验证目录没有未归类失败产物；
- OpenSpec strict validation 通过。

No-Go 的强制条件：

- 未编辑文件 bytes 改变；
- 编辑非尾部正文导致尾部空行或未触及 span 改变；
- stale revision、错误 document identity 或异步结果写入当前文档；
- save 在 pending/blocked/conflict 时写入旧 snapshot；
- Source/Live Preview 切换改变正文、dirty 或 History；
- 真实 Live Preview 只显示未投影源码却被宣称完成；
- Undo/Redo 不能恢复正文与 selection；
- 人工验收脚本存在阻塞失败。

## 9. 回滚设计

P1B-P4B 必须保留 feature flag 回滚到上一阶段已验证路径。回滚只改变入口或投影，不得把已打开的 lossless session 临时交给 ProseMirror。安全回滚顺序为：

1. 阻止新文档进入问题 flag；
2. 对当前 pending pipeline 执行 flush，无法 flush 则阻止保存并提示导出恢复副本；
3. 关闭当前 session；
4. 重新以明确 owner 打开文档；
5. 比较磁盘 hash 与已持久化 revision；
6. 记录 rollback evidence。

P5 删除 legacy 后，回滚单位是应用版本，不再是运行时切回 ProseMirror。

## 10. 完成定义

Program 只有在 P5 完成后才能宣称“完成”。P1B 通过只能宣称“无损 Source 闭环完成”；P2 通过只能宣称“基础 Live Preview 可用”；P3 通过只能宣称“默认编辑路径完成”；不得提前使用“重构完成”措辞。
