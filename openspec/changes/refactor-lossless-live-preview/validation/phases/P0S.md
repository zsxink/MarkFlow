# P0S 验证记录：Legacy 零编辑写盘安全止血

总体状态：BLOCKED by P0

正式设计：[P0S：Legacy 零编辑写盘安全止血](../../design/phases/P0S-legacy-no-edit-save-guard.md)

## Candidate identity

| Branch | Commit | Flags/settings | Run ID |
| --- | --- | --- | --- |
| `test/issue-255-lossless-byte-contract` | NOT RECORDED | legacy + autosave=true / interval NOT RECORDED | NOT RECORDED |

## AI Coding 验证

- [ ] Unit/typecheck/build/Rust/OpenSpec gates
- [ ] `setContent`/hydration 不增加 user revision
- [ ] `setEditable`/read-only 切换不发送正文 update、不增加 user revision
- [ ] legacy dirty 不依赖 PM serializer/normalized string 回比
- [ ] autosave coordinator clean guard
- [ ] 最终 write 入口 clean guard，错误 UI dirty 仍不写盘
- [ ] 干净 Ctrl+S 返回 `skipped`，不调用 serializer/write
- [ ] LF/CRLF/CR/Mixed/BOM/tail0-3 lifecycle regression
- [ ] autosave=true，零编辑等待至少两个 tick
- [ ] dirty=false、save count=0、hash/length/mtime 不变、关闭无提示
- [ ] A/B 打开、只读→可写、reload 不产生零编辑写盘
- [ ] 一个真实用户 transaction 增加 revision/dirty，legacy 保存仍可触发
- [ ] P0 编辑后 L1 failing characterization 仍被如实记录，未误标为已修复
- [ ] 新 RUN 链接不可变的 P0 failing/corrective evidence

## 人工验证记录

- 验收人/日期/设备：NOT RECORDED
- fixture/hash：NOT RECORDED
- autosave/interval：NOT RECORDED

- [ ] LF tail2/tail3 零编辑等待两个 tick
- [ ] CRLF tail2/tail3 零编辑等待两个 tick
- [ ] dirty=false、save count=0、hash/length/mtime 不变
- [ ] 关闭无未保存提示
- [ ] 干净 Ctrl+S 不写盘
- [ ] 只读→可写与 A/B 切换不标脏
- [ ] 全新副本输入一个字符后正常 dirty/save
- [ ] 验收记录明确 P0S 不解决编辑后 byte fidelity

人工结论：NOT STARTED

## Reviewer 与决定

- [ ] Reviewer 静态检查没有接受 serializer 输出作为 baseline
- [ ] Reviewer 确认没有扩大 trailing metadata 或全局关闭 autosave
- [ ] Reviewer 确认 transaction origin/revision 不漏真实用户编辑
- [ ] Reviewer 重跑 LF + CRLF/Mixed 真实 desktop lifecycle
- [ ] Reviewer 确认 clean guard 位于最终 write 前
- Reviewer：NOT RECORDED
- Open blocking issues：NONE RECORDED
- Program Go/No-Go：NOT STARTED
