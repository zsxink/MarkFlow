# P0 Lossless Byte Contract — 任务清单

执行约束：P0 是 Issue #254 program 的 Slice 0。只建立证据，不改变默认编辑器，不实现 markflow-core。每个任务完成后更新本 checklist；验证证据写入 `validation/evidence/P0/<run-id>/`，并更新 umbrella `validation/phases/P0.md` 与本 child change 的验证记录。

## 1. 基线刻画（1.1）

- [x] 1.1.1 记录基线 SHA `feat-v0.1.0@6bfba453`、支持平台、feature flags、日志目录、Node/npm/Rust/Cargo/Tauri/WebView 版本（见 `docs/baseline.md`）
- [x] 1.1.2 记录当前编辑链路调用图（read_file → setMarkdown → PM → getMarkdown → normalizeImageMarkdown → write_file）与 #189 trailingNewlines 补偿位置（见 `docs/baseline.md`）

## 2. Canonical fixtures（1.2）

- [x] 2.1 设计 fixture 矩阵（UTF-8/BOM、LF/CRLF/CR/Mixed、尾部 0/1/2/3 换行、文中空行、Unicode、列表/fence/frontmatter/图片/malformed）
- [x] 2.2 实现确定性生成脚本 `tests/byte-contract/generate-fixtures.mjs`（固定内容，无随机）
- [x] 2.3 生成 fixtures 与 `manifest.json`（path/length/sha256/bom/eol/trailing）
- [x] 2.4 生成 `l1-intents.json`（每 fixture 3-4 组 edit intent + 预期 surviving intervals）

## 3. L0/L1 harness（1.3）

- [x] 3.1 实现 `l0-harness.mjs`：输入/输出 sha256、length、byte diff 全等判定 + JSON diff
- [x] 3.2 实现 `l1-harness.mjs`：old→new surviving interval map，prefix/suffix/存活 span 逐字节比较 + BOM/尾部/EOL 断言
- [x] 3.3 实现 negative controls：故意损坏未触及 byte 必须失败（self-check 内置，含 CRLF/Mixed/Unicode）

## 4. PM 尾换行丢失复现（1.4）

- [x] 4.1 实证定位 #189 补偿不满足 L1 的场景（CRLF/CR 尾部被改/丢失、count 低估、陈旧元数据补回用户删除）—— 见 `docs/pm-tail-newline-characterization.md`
- [x] 4.2 实现 `pm-tail-newline.characterization.test.ts`，驱动真实 Tiptap + tiptap-markdown + 真实 `setMarkdown`/`getMarkdown`，以字节级 diff 稳定复现
- [x] 4.3 配置独立 config `vitest.characterization.config.ts` + `npm run test:characterization`（不进默认红色 suite）

## 5. ADR 冻结（1.5）

- [x] 5.1 ADR-001 坐标类型与 PositionMap 错误语义
- [x] 5.2 ADR-002 EOL inheritance 与 paste provenance（唯一顺序）
- [x] 5.3 ADR-003 按操作 identity matrix
- [x] 5.4 ADR-004 guarded-write/CAS capability（macOS AVAILABLE，Windows/Linux BLOCKED）与 Save Copy 降级
- [x] 5.5 ADR-005 无效 UTF-8 行为；ADR-006 Save As 格式策略
- （权威记录见 `docs/adr.md`；Reviewer 签字 PENDING）

## 6. Tauri dispatcher contract harness（1.6）

- [x] 6.1 建立最小骨架：`src-tauri/src/dispatcher_contract.rs`，`tauri::test` mock App + 真实 `State<AppState>` + 真实文件系统
- [x] 6.2 断言 round-trip 字节/BOM 保真、缺失文件与 100MB 上限错误映射；记录 command 名与 payload sha256；禁止仅 mock invoke
- [ ] 6.3 （未来 Slice）把 Core commands 以同一模式追加进 harness

## 7. 全 gate 与基线证据（1.7）

- [ ] 7.1 运行 npm test、npx tsc --noEmit、npm run build、cargo test、npm run test:e2e（smoke）、openspec validate --all、archive sync gate
- [ ] 7.2 创建 `validation/evidence/P0/<run-id>/RUN.md` + `ENVIRONMENT.md`（environment hash、命令、退出码、fixture hash、byte diff、未运行项）
- [ ] 7.3 更新 umbrella `validation/phases/P0.md` 的 AI 验证清单

## 8. 独立 Reviewer（1.8）

- [ ] 8.1 派独立 Reviewer 检查 fixture manifest、L0/L1 positive/negative controls、PM 失败复现与 ADR
- [ ] 8.2 Reviewer 重跑 LF、CRLF/Mixed、Unicode 各一组 + 故意损坏 negative control，输出 REVIEW.md

## 9. 行为矩阵（1.9–1.10）

- [x] 9.1 Muya e52106f / Vditor a1302b0 固定 SHA 行为矩阵（block closure/marker reveal/selection/Enter/Backspace/paste/History），冻结可借鉴/禁止移植（见 `docs/behavior-matrix-editors.md`）
- [x] 9.2 ChatGPT Desktop 26.803.61601 黑盒矩阵：观察协议冻结，Observed 列待人工填写，Officially documented 严格限定，Inference 明确禁止（见 `docs/behavior-matrix-chatgpt-desktop.md`）

## 10. 人工验收交接

- [ ] 10.1 准备人工步骤与候选 commit/flags 后停止，通知用户执行 P0 人工验证（LF+CRLF fixtures、正文单字符编辑、2/3 boundary）
- [ ] 10.2 P0 Go 前禁止进入 P1A；只有 AI、独立 Reviewer、人工验收与 Program Owner 全部通过才标记 Go
