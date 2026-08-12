# P1B：Bridge 与无损 Source 纵向闭环

## 1. 目标

在 `losslessCoreSession` default-off flag 下，完成真实 Tauri 桌面应用的 disk bytes→Core→CodeMirror Source→patch→Core confirmed bytes→atomic save→reopen 闭环。

## 2. 输入与依赖

- P1A Go；
- Core error/position/session API 稳定；
- 真实 Tauri dispatcher harness；
- `design/02-core-session-and-sync.md`；
- `design/04-save-resource-conflict.md`；
- [P1B 验证记录](../../validation/phases/P1B.md)。

## 3. 实施范围

- Rust session registry 与 bridge commands；
- 前端 `EditorSurfaceBinding` 最小版；
- 单 in-flight SourceSyncController；
- Source 模式打开、patch、flush、save、reload、close；
- revision dirty/autosave guard；
- Core bytes guarded atomic write、saveOperationId、durable receipt、file identity 与 outcome reconcile；
- blocked/resync/recovery text；
- new/save-as/external conflict 的最小闭环；
- parser/render 不可用不影响 Source；
- legacy 默认路径保持不变，owner 严格隔离。

## 4. AI Coding 验证

AI 必须运行：

- `npm test`；
- `npx tsc --noEmit`；
- `npm run build`；
- `cargo test --manifest-path src-tauri/Cargo.toml`；
- `npm run test:e2e:build`；
- `npm run test:e2e` 与 lossless 专项 regression；
- 全 canonical fixture 真实打开、无编辑 Save、正文编辑 Save、reopen hash；
- 继承 P0S lifecycle：产品实际 autosave 开启，零编辑等待至少两个 tick，记录 dirty、close prompt、save count、hash/length/mtime；
- 干净 Ctrl+S、reload、关闭和 A/B 切换均不得触发 write；
- pending 输入后立即 Save；
- 写盘期间继续输入；
- patch timeout/retry/duplicate ack/stale ack；
- A/B 文档快速切换和旧响应注入；
- autosave clean skip、dirty save、blocked skip；
- external modification conflict；
- atomic write/rename/permission failure；
- prepare 后外部替换、锁不被遵守、write/commit response 丢失、重复 operation 与启动 receipt reconcile；
- close/reload/save-as 的 flush barrier；
- renderer/parser command 故障时 Source 保持可用。
- 对 lossless flag 的打开、dirty、autosave、手动保存、reload、close 做调用审计，证明不调用 `setMarkdown/getMarkdown/normalizeImageMarkdown` 或 PM serializer。

所有 desktop E2E 使用隔离 workspace，证据索引写入 `validation/evidence/P1B/<run-id>/`；大型原始 artifact 进入受控 CI artifact 或项目忽略的临时证据目录，日志先脱敏。

## 5. 独立 Reviewer 验证

Reviewer 检查：

- 产品 save path 没有 serializer/normalize/PM 正文来源；
- clean-session guard 同时存在于 autosave coordinator 与最终 write 入口，错误 UI dirty 也不能造成写盘；
- dirty 使用 revision/pending，而不是 normalized string；
- blocked/conflict 不写盘；
- async request 按操作 identity matrix 携带字段，不把 file identity 用于拒绝合法 patch；
- guarded write 在替换点复核 identity，outcome unknown 可幂等 reconcile；
- session disposal 取消 timer/listener/request；
- feature flag 关闭时完全走 legacy，开启时同一文档不触碰 PM owner；
- 真实 dispatcher 测试不是只 mock `invoke`。

## 6. 人工验证

人工使用 lossless flag：

1. 打开 LF、CRLF、BOM，以及尾部 2/3 个 line-break boundaries fixtures；
2. 开启 autosave，不编辑等待至少两个 tick，确认 dirty=false、save count=0、hash/length/mtime 不变且关闭无提示；
3. 对干净文档主动 Ctrl+S，确认不写盘；
4. 在另一全新副本的正文中间输入中文和 emoji，立即保存；
5. 重开并由脚本比较 bytes；
6. 开启 autosave，修改正文并等待；
7. 保存前用外部工具修改磁盘文件，确认不会静默覆盖；
8. 模拟断开/阻塞 patch，确认 Save 被阻止且恢复文本可复制；
9. 快速 A/B 切换，确认内容、dirty、错误提示不串文档；
10. 关闭 lossless flag，确认 legacy 基线仍可使用且 P0S 已启用；
11. 检查错误提示可理解且不泄漏正文。

## 7. 必须证据

- bridge contract test；
- E2E 视频/截图、日志和 fixture hashes；
- patch state transition trace；
- conflict/atomic failure artifacts；
- guarded-write race、receipt 与 lost-response reconcile artifacts；
- flag on/off ownership trace；
- Reviewer 报告；
- 人工签字记录。

## 8. Go/No-Go

Go：全部 fixture 真实桌面零编辑 lifecycle、干净 Ctrl+S、L0/L1 通过；pending/blocked/conflict/outcome-unknown 保存安全；guarded-write race 与 restart reconcile 通过；A/B 隔离；人工工作流通过。

No-Go：任何 serializer 保存；旧 snapshot 写盘；数据串文档；flag 打开后 parser/renderer 失败导致不能编辑保存；自动测试只 mock 前端。

## 9. 回滚

保持 `losslessCoreSession=false` 为发布默认。回滚关闭 flag 并确认新 session 走 legacy；已在 lossless session 打开的文档先安全 flush/close，不执行 owner 热切换。
