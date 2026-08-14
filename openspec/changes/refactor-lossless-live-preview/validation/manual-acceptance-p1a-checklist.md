# P1A Core Contract Acceptance 清单 — 最小 Lossless Core

阶段：P1A（Slice 1A）
关联：Issue #254 / umbrella change `refactor-lossless-live-preview`
AI gate：run `20260813-p1a-core-0967a06`（candidate `648e9a3`，含 reviewer 纠偏 + §3.5 冻结测试）
本清单用途：P1A 无产品 UI，验收为**审阅 Core API / byte diff / 零 patch prepare-save 报告**。

> **治理决定（2026-08-14）**：Program Owner 已将 P1A 这类非 UI 的 Core contract
> acceptance 授权给 Codex AI 执行；xian 不需要填写本清单。AI 的实际验收记录位于
> `validation/evidence/P1A/20260814-161034-p1a-ai-contract-9ad0513/AI-ACCEPTANCE.md`。
> xian 只在后续已接入产品界面的阶段执行最终界面编辑/效果验收。

> **执行方式（一键脚本）**：运行 `bash scripts/p1a-acceptance.sh`。
> 脚本可自动跑全部机器 gate，并逐项打印证据路径供 Core contract reviewer 核对。
> 本清单是脚本背后的验收项；AI 不能把它伪造为 xian 的人工签字。

---

## 0. 前置：干净环境

- [ ] 确认当前分支为 `test/issue-255-lossless-byte-contract`，code candidate = `648e9a3`。
- [ ] 确认 Core 未接入任何产品入口（`src-tauri/` 与前端无 lossless flag 变更）。
- [ ] 记录：验收人 / 日期 / 设备 / OS。
      → 待填写

---

## 1. 审阅 Core API 严格小于 draft 范围（P1A §6.1）

对照 `markflow-core/src/lib.rs` 与 `Cargo.toml`：

- [ ] 只含 document snapshot / TextBuffer / LineEndingMap / PositionMap / TextPatch / LosslessDocumentSession。
- [ ] `Cargo.toml` 依赖仅 `serde`（derive）+ `sha2`；dev 仅 `serde_json`。
- [ ] **不包含** parser、Render IR、widgets、History、DOM、Tauri、网络。
- [ ] 未引用 `feat-v0.1.0-draft` 分支的 markflow-core 代码（独立重写，仅作参考）。

## 2. 审阅五组代表性 byte diff（P1A §6.2）

见 evidence run `BYTE-DIFF-REPORT.md` 与 `fixture_l1.rs`：

- [ ] LF tail0/1/2/3 四组：正文编辑后 prefix/suffix/trailing 逐字节不变。
- [ ] CRLF tail1/2/3 三组：CRLF 边界与 trailing CRLF 完整保留。
- [ ] Mixed tail2：混合 separator 顺序（LF/CRLF/CR/LF）编辑后未触及部分原样保留。
- [ ] BOM：utf8-bom-lf-tail2 编辑后 BOM 仍在。
- [ ] Unicode CJK/emoji/combining：UTF-16/UTF-8/source 坐标正确，surrogate 边界拒绝。

## 3. 零 patch prepare-save 报告（P1A §6.3）

- [ ] `fixture_l0.rs::zero_patch_prepare_save_returns_original_bytes_for_every_fixture`：
      24 个 fixtures 全部 `prepare_save == original bytes`，SHA-256 与 manifest 一致。
- [ ] 重复 clean prepare 不改变 revision/hash（同测试内循环 3 次）。
- [ ] 显式 clean save payload 不来自 parser/serializer（`clean_save_has_no_parser_or_serializer_dependency`）。

## 4. LF/CRLF/Mixed/BOM/尾部空行行为符合产品预期（P1A §6.4）

- [ ] 正文编辑保留尾部空行（`fixture_l1::body_edit_preserves_trailing_boundaries`）。
- [ ] 普通 inherit 固定顺序：被替换 boundary → 右邻 → 左邻 → dominant（`eol_provenance::inherit_*`）。
- [ ] §3.5 overflow 顺序消费（`inherit_overflow_right_differs_from_dominant`、reviewer `reviewer_multi_overflow_order`）。
- [ ] 显式 paste provenance（LF/CRLF/CR）优先于 inherit（`eol_provenance::explicit_*`）。
- [ ] provenance 数量不符 → Patch 原子拒绝（`negative::provenance_count_mismatch_rejected`）。

## 5. 无效 UTF-8 产品行为（P1A §6.5）

- [ ] `negative::invalid_utf8_open_refused`：无效 UTF-8 → `UnsupportedEncoding`，session 拒绝，不 replacement-decode 覆盖。
- [ ] 前端提示文案方案：待 xian 决定（Core 返回稳定 error code `invalid-encoding`，前端据此显示只读/拒绝提示）。

## 6. Benchmark 可进入 P1B（P1A §6.6）

- [ ] 审阅 `gate_core_bench.log`：50 MiB open 307ms / prepare-save 22ms / patch 137ms。
- [ ] 确认进入 P1B 不会明显阻塞打开/输入。

## 7. 签署 byte contract（P1A §6.7）

- [ ] 确认 Core 保存主链不依赖 parser/renderer。
- [ ] 签署：未编辑保存 = 原始 bytes；编辑后仅意图覆盖范围 + 新增 bytes 改变；未触及 BOM/EOL/trailing 保留。

---

## 结论

- 验收人：NOT RECORDED
- 结果：NOT STARTED
- 记录：待填写

> 不要替 xian 勾选本清单；本文件由 xian 亲自填写。
