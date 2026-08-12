# P0 人工验收清单（handoff）

> 人工验收人执行。AI 已停止，不代替点击。候选 commit：`dd610f7`
> （branch `test/issue-255-lossless-byte-contract`；产品代码与基线 `6bfba453` 完全一致，
> P0 未修改任何产品 runtime）。flags：legacy baseline（无 lossless flags，默认 ProseMirror 路径）。
>
> 对应设计：umbrella `design/phases/P0-baseline-contract.md` §6 人工验证。
> 验收结果写入 umbrella `validation/phases/P0.md`「人工验证记录」或本目录的验收记录。

## 目的与验收语义

在真实桌面应用上分别确认两条互不替代的 legacy 基线失败：

1. **L0 生命周期失败**：只打开、零编辑，等待 autosave 后出现 dirty、关闭提示、mtime 或 bytes 变化；
2. **L1 编辑后失败**：只修改正文一个字符并保存后，未触及的 EOL、soft break 或文末换行 bytes 被改写。

P0 人工 `Accept` 的含义是“AI characterization 与真实产品失败一致，可以据此进入修复阶段”，不是 legacy 产品通过 byte fidelity。任一规定步骤未执行，或人工发现了 AI 未覆盖的新失败路径，都必须先记为 **P0 corrective run required**，不能用“失败更严重”代替未执行步骤。

## 准备

1. 从 `tests/fixtures/byte-contract/fixtures/` 为每个场景分别复制一组全新 fixture 到隔离工作目录
   （**不要**修改 `tests/fixtures/...` 原件）：
   - `utf8-lf-tail2.md`（LF，2 个尾部边界）
   - `utf8-lf-tail3.md`（LF，3 个尾部边界）
   - `utf8-crlf-tail2.md`（CRLF，2 个尾部边界）
   - `utf8-crlf-tail3.md`（CRLF，3 个尾部边界）
   - L0 与 L1 必须使用不同副本，例如 `l0-manual-tail2-lf.md` 与 `l1-manual-tail2-lf.md`，避免 L0 autosave 改写污染 L1 输入。
2. 记录每个副本的 SHA-256：
   `shasum -a 256 <副本路径>`
3. 启动应用：`npm run tauri dev`（或已构建的 debug 版本）。记录实际 autosave 开关与 interval；L0 必须开启 autosave，且至少等待两个 interval。

## 操作步骤 A：零编辑生命周期（每个 L0 副本各一次）

| # | 操作 | 观察点 | 记录 |
| --- | --- | --- | --- |
| A1 | 记录 hash、长度、mtime 后打开副本，绝不输入、粘贴、切换模式或点击保存 | dirty 是否变化，是否出现保存提示 | 结果 |
| A2 | 等待至少两个 autosave interval | 每个 tick 是否写盘；记录 save count/mtime | 结果 |
| A3 | 再次记录 hash、长度、mtime，并关闭文档/应用 | 是否弹出未保存提示 | 结果 |
| A4 | 用 `xxd` 和 L0 harness 比较 | 分别记录 soft break、EOL、尾部 boundary diff | 结果 |
| A5 | 重开已经过 A1-A4 的副本 | UI 是否与磁盘实际 bytes 一致 | 结果 |

## 操作步骤 B：正文单字符编辑（每个 L1 全新副本各一次）

| # | 操作 | 观察点 | 记录 |
| --- | --- | --- | --- |
| B1 | 打开全新的 L1 副本，不等待 autosave，立即在正文中间改一个字符（如 `Body` → `BodyX`） | 记录唯一用户 edit intent 与 source range | 结果 |
| B2 | 立即主动保存 | 记录保存后的 hash、长度、mtime | 结果 |
| B3 | 用 `xxd` 与 L1 harness 比较 | 只有声明的 edit range 可变化；soft break/EOL/尾部 boundary 分项记录 | 结果 |
| B4 | 重开文件 | UI、正文字符和 byte diff 是否一致 | 结果 |
| B5 | 对 LF tail2/tail3 与 CRLF tail2/tail3 分别执行 | 2/3 boundary 不得混用 | 结果 |

## 判定要点

- **区分术语**：报告/记录中「尾部换行边界数」按行尾换行边界计（`\r\n\r\n` = 2），
  「正文后的视觉空白行数」是渲染表现，两者不得混用。
- **预期失败**：按 AI gate 证据，正文编辑后 CRLF 副本的尾部会变成 LF 且边界数
  减少（2→1），CR 副本尾部丢失。若人工观察**没有**发现失败，请记录并与 byte diff
  对照查因（可能是我报告的复现场景与你的操作路径不同），不要直接把 AI 结论标成
  「已修复」。
- **不误标已修复**：AI 报告应如实描述当前失败，不得描述成已修复；请核对本清单
  附带的 evidence（`validation/evidence/P0/20260812-192707-p0-baseline/RUN.md`）。
- **不混淆 P0 与产品验收**：legacy 应用可以是 `REJECT`，同时 P0 characterization 可以在准确覆盖失败后 `Accept`。但只要人工观察超出 AI 覆盖，P0 就先进入 corrective run，不能立即 Accept。

## 辅助验证脚本

```bash
# 比较「打开时」与「保存后」的字节是否一致（L0 判定）
node tests/byte-contract/l0-harness.mjs <输入副本> <保存后的文件>
# 若输出 pass:false 并给出 byteDiffCount，说明保存改写/丢失了字节
```

## 结论记录

- 验收人：xian（人工执行）
- 日期/设备/OS：2026-08-12 / macOS Darwin 25.5.0 / Tauri dev build（DEBUG）
- 使用 fixture 与 hash：副本在 `/Users/xian/markflow-test/manual-acceptance-20260812/`，原件未触碰
  - `manual-tail2-lf`：基线 `bc1b50f4…a0` → 保存后 `12162470…78`
  - `manual-tail3-lf`：基线 `201dc08c…d1` → 保存后 `c6e6dacd…12`
  - `manual-tail2-crlf`：基线 `6928ce65…fb` → 保存后 `9f18b50b…a1`
  - `manual-tail3-crlf`：基线 `db562fc5…2a` → 保存后 `9f18b50b…a1`
- 本轮结论：**基线应用 Reject**（byte fidelity 不通过，失败范围比原 AI characterization 更广）；**P0 corrective run required**（原 AI gate 未覆盖零编辑真实生命周期，且 B1-B5/重开/ADR 尚未完成）
- 阻塞项：补 lifecycle characterization、corrective evidence run、独立复核；完成 B1-B5、重开与 ADR 审阅后才可提交 Program Owner Go/No-Go

### 实测要点（人工观察，2026-08-12）

验收人**仅打开浏览、零编辑**，应用自动将全部 4 个副本改写（mtime 每 ~10s 变化 = autosave 间隔），关闭窗口时弹出未保存对话框（dirty=true）——即**仅打开即触发 dirty + autosave 写盘**。

| 副本 | 基线尾部 | 保存后尾部 | 判定 |
| --- | --- | --- | --- |
| manual-tail2-lf | `\n\n` | `\n\n` | LF 尾保留；中间软换行 `\n`→` ` ❌ |
| manual-tail3-lf | `\n\n\n` | `\n\n\n` | LF 尾保留；中间软换行 `\n`→` ` ❌ |
| manual-tail2-crlf | `\r\n\r\n` | `\n` | CRLF→LF，边界 2→1 ❌ |
| manual-tail3-crlf | `\r\n\r\n\r\n` | `\n` | CRLF→LF，边界 3→1 ❌（保存后与 tail2 字节完全相同） |

对照预期：CRLF 尾坍缩为 AI gate 声称的失败，LF 尾被 #189 `trailingNewlines` 补偿保留；
未观察到「没失败」的情况，未把 AI 结论误标为已修复。

### 2026-08-13 补充轮执行记录（验收人 xian）

- 测试材料：`/Users/xian/markflow-test/manual-acceptance-20260813/`（副本 + 只读 baseline + intent.json）。
  本轮应用把 8 个工作文件与 8 个 baseline 均改写（用户对每个可见文件都执行了流程）；
  baseline 由 AI 从 `tests/fixtures/byte-contract/fixtures/` 原件恢复，**原件未被触碰**
  （fixture mtime 仍为生成时刻），恢复后 baseline SHA 与 manifest 逐字节一致。
- 本轮执行（真实桌面应用，Tauri dev build，autosave 默认开启 ~10s）：
  - **L0 零编辑 ×4**（复跑）：仅打开 → dirty → autosave 写盘；保存后 SHA 与 corrective machine run
    `20260813-005131` 逐字节一致。
  - **L1 正文单字符编辑 B1–B3 ×4**：打开后 10s 内光标置于 `Body` 后输入 `X`（`Body`→`BodyX`）→ 立即 ⌘S；
    `l1-*.intent.json` 预置 intent（LF 字节 13、CRLF 字节 15），compare 全 `pass:false`。

| 副本 | 基线 SHA | 保存后 SHA | 长度 | 失败类型 | compare |
| --- | --- | --- | --- | --- | --- |
| l0-tail2-crlf | `6928ce65…bafb` | `9f18b50b…bfa1` | 73→67 | 零编辑即写盘；CRLF→LF、尾 `\r\n\r\n`→`\n`（2→1）、软换行→空格 | `pass:false`（byteDiffCount=64） |
| l0-tail2-lf | `bc1b50f4…a0` | `12162470…78` | 68→68 | 零编辑即写盘；软换行 `\n`→` `；尾 `\n\n` 保留 | `pass:false` |
| l0-tail3-crlf | `db562fc5…2a` | `9f18b50b…bfa1` | 75→67 | 同上；尾 3→1（保存后与 tail2 相同） | `pass:false` |
| l0-tail3-lf | `201dc08c…d1` | `c6e6dacd…12` | 69→69 | 软换行→空格；尾 `\n\n\n` 保留 | `pass:false` |
| l1-tail2-crlf | `6928ce65…bafb` | `35c2f3fd…0fd` | 73→68 | **X 正确插入（prefixOk）**；CRLF→LF（firstDiffAt=7）、尾 2→1、软换行→空格 | `pass:false` |
| l1-tail2-lf | `bc1b50f4…a0` | `c5b52187…acc` | 68→69 | **X 正确插入（prefixOk）**；软换行→空格（firstDiffAt=53）、尾保留 | `pass:false` |
| l1-tail3-crlf | `db562fc5…2a` | `35c2f3fd…0fd` | 75→68 | 同 tail2-crlf（保存后与 tail2 相同） | `pass:false` |
| l1-tail3-lf | `201dc08c…d1` | `07f7a2fb…674` | 69→70 | **X 正确插入（prefixOk）**；软换行→空格、尾 `\n\n\n` 保留 | `pass:false` |

判定：**L0 复跑与 L1 B1–B3 全部按预期复现基线违约**，未观察到「没失败」的副本；
L1 的 `X` 插入全部落在声明 intent 内（prefixOk=true），未触及字节仍被改写。
legacy 产品 byte fidelity：REJECT（维持）；P0 characterization 覆盖度：与 AI/机器证据一致。

### 本轮未完成项（保持 PENDING）

- [x] B4/A5 重开 UI 与改写后磁盘 bytes 一致 —— **2026-08-13 完成**：验收人重开保存后的 l1 副本确认
  UI 显示正文为一行（`BodyX paragraph with ASCII and CJK 中文。 Another line.`），与磁盘保存内容
  （软换行已写盘为空格）一致；
- [x] 审阅 ADR 的新增换行继承规则与 invalid UTF-8 行为 —— **2026-08-13 AI 受托完成（PASS）**，见下方
  「ADR 审阅记录」；验收人委托执行并保留复核/推翻权；
- [x] 在 corrective AI run 后对照新报告确认零编辑生命周期已被机器捕获 —— **2026-08-13 AI 受托完成**：
  机器保存后 SHA 与人工 08-13 磁盘实测逐字节一致（4/4），见下方「SHA 验证记录」；
- [x] 由新的独立 Reviewer 复核真实 open/dirty/autosave/write 调用链（task 8.3，2026-08-13 PASS，见
  `validation/evidence/P0/20260813-005131-p0-corrective-zeroedit-lifecycle/REVIEW.md`）。

### ADR 审阅记录（AI 受托，2026-08-13）

审阅对象：`docs/adr.md`（ADR-001~006，FROZEN 2026-08-12）。结论：**PASS（6/6 无矛盾）**。

| ADR | 结论 | 依据 |
| --- | --- | --- |
| ADR-001 坐标四类型 | ✓ | 针对 P0 最大风险面（坐标错位）；禁止截断到字符边界符合保真方向 |
| ADR-002 EOL inheritance | ✓ | 规则 1/8 直接对应 P0 捕获失败（CRLF 尾坍缩、软换行丢失）的修复方向；规则 4 唯一顺序与 design 01 §3 逐字一致（独立 Reviewer 已核） |
| ADR-003 identity matrix | ✓ | 防止「保存更新 file identity 被误判 stale」；与 design 02 §2 一致（独立 Reviewer 已核） |
| ADR-004 guarded-write/CAS | ✓ | 单一 atomic command + durable receipt + 平台矩阵；macOS AVAILABLE 与 ENVIRONMENT.md 平台事实一致；正是要拦截「零编辑 autosave 改写原文件」的机制 |
| ADR-005 无效 UTF-8 | ✓ | 只读/拒绝打开 + 禁止 replacement decode 覆盖写盘，防止零编辑写盘路径损坏无效 UTF-8 文件 |
| ADR-006 Save As | ✓ | 继承 BOM/EOL，与 ADR-002 规则 9 一致 |

实现期观察（不阻塞，留 P1 确认）：ADR-002 规则 3 需在 CM 归一化前读原始 paste payload
（输入规则/粘贴钩子排序依赖）；ADR-005「只读 vs 拒绝打开」的 UI 由 P1 决定，属合理授权。

### SHA 验证记录（AI 受托，2026-08-13）

对照 `validation/evidence/P0/20260813-005131-p0-corrective-zeroedit-lifecycle/REVIEW.md` 的机器保存后 SHA，
与人工 08-13 磁盘实测（`/Users/xian/markflow-test/manual-acceptance-20260813/l0/*.md`）逐字节比对：

| fixture | 机器 SHA | 人工 SHA | 一致 |
| --- | --- | --- | --- |
| utf8-lf-tail2 | `12162470b7e2bf01…5678` | 同左 | ✓ |
| utf8-lf-tail3 | `c6e6dacd3f1c49fa…9d12` | 同左 | ✓ |
| utf8-crlf-tail2 | `9f18b50b47544ca6…bfa1` | 同左 | ✓ |
| utf8-crlf-tail3 | `9f18b50b47544ca6…bfa1` | 同左 | ✓ |

结论：**机器复现 == 人工复现（4/4 逐字节一致）**，零编辑生命周期已被机器捕获。

### 最终待决项（人工 / Program Owner）

- [ ] P0 characterization 人工 Accept/Reject（Accept 仅表示基线刻画准确，不表示 legacy byte fidelity 通过）；
- [ ] Program Owner Go/No-Go（Go 前不进入 P1A）。

（人工 `Accept with recorded risk` 不能覆盖 byte fidelity / 错误写盘 / 安全 /
跨文档污染问题；这四类只能 Reject。）
