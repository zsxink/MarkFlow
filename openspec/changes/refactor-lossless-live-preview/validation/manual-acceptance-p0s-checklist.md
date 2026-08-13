# P0S 人工验收清单 — Legacy 零编辑写盘安全止血

阶段：P0S（Slice 0S）
关联：Issue #254 / umbrella change `refactor-lossless-live-preview`
AI gate：run `20260813-031727-p0s-legacy-no-edit-guard`（C01–C10 全 PASS）
本清单用途：人工桌面 E3 验证（真实 Tauri WebView + 真实隔离文件），操作步骤与记录表。

---

## 0. 前置：环境与干净实例

- [x] 确认没有其他 MarkFlow 实例在运行（避免 single-instance 干扰）。
- [x] 记录：验收人 / 日期 / 设备 / OS / WebView / 显示缩放。
      → xian / 2026-08-13 / macOS Darwin 25.5.0 / Tauri dev build（DEBUG）/ WKWebView（Tauri v2 默认）/ 显示缩放未单独记录。
- [x] 记录 autosave 配置：设置中 `自动保存` 开启，间隔为产品默认（10000ms）。**不要关闭 autosave**。
- [x] 准备隔离副本：从仓库 `tests/fixtures/byte-contract/fixtures/` 复制下列 fixture 到
      `/Users/xian/markflow-test/p0s-acceptance-20260813/`（平铺 .md，不建子目录/README/JSON）：
      `utf8-lf-tail2.md`、`utf8-lf-tail3.md`、`utf8-crlf-tail2.md`、`utf8-crlf-tail3.md`、
      `utf8-cr-tail1.md`、`utf8-mixed-tail2.md`、`utf8-bom-lf-tail2.md`。
- [x] 对每个副本记录初始 SHA-256、byte length、mtime（`shasum -a 256`、`stat -f "%z %m"`）。

> 记录表见下。每个文件单独一行，操作前记录 `Before`，操作后记录 `After`。

---

## 1. 零编辑打开 → 等待两个 autosave tick → 关闭

对每个 fixture 副本（LF tail2/tail3、CRLF tail2/tail3、CR、Mixed、BOM）：

1. 在 MarkFlow 中打开该文件，**不做任何编辑**。
2. 观察至少 20 秒（≈ 两个 autosave interval）。
3. 关闭文件/窗口。

预期（全部满足才勾选）：

- [x] dirty=false：窗口关闭时**不弹出**「未保存的更改」提示。（全部 7 个副本均无提示）
- [x] save count=0：文件 mtime、hash、length 与打开前完全一致（`stat`/`shasum` 对比；`verify-all.sh` 全 OK）。
- [x] 编辑器状态栏/标题无「未保存」标记。

记录表：

| 文件 | Before SHA/length/mtime | After SHA/length/mtime | 关闭提示? | save count | 结果 |
| --- | --- | --- | --- | --- | --- |
| utf8-lf-tail2 | bc1b50f4…a0 / 68 / 1786584675 | 同左（未变） | 无 | 0 | PASS |
| utf8-lf-tail3 | 201dc08c…d1 / 69 / 1786584675 | 同左（未变） | 无 | 0 | PASS |
| utf8-crlf-tail2 | 6928ce65…fb / 73 / 1786584675 | 同左（未变） | 无 | 0 | PASS |
| utf8-crlf-tail3 | db562fc5…2a / 75 / 1786584675 | 同左（未变） | 无 | 0 | PASS |
| utf8-cr-tail1 | 3e505e2c…79 / 67 / 1786584675 | 同左（未变） | 无 | 0 | PASS |
| utf8-mixed-tail2 | 0a892d54…85 / 91 / 1786584675 | 同左（未变） | 无 | 0 | PASS |
| utf8-bom-lf-tail2 | c7d99fe8…fd / 71 / 1786584675 | 同左（未变） | 无 | 0 | PASS |

---

## 2. 干净 Ctrl+S

对一个零编辑打开、干净的副本（任意一个）按 `Ctrl+S`（macOS 为 `Cmd+S`）。

- [x] 文件 mtime、hash、length 不变（不写盘）。
- [x] 界面不出现「已保存」toast（因未实际写盘；干净文档主动保存为静默 skip）。

---

## 3. 只读 → 可写 与 A/B 切换

- [x] 打开只读预览（如大文件只读打开），再切回可写：零编辑，不标脏、不写盘。
- [x] 打开 A 文件 → 打开 B 文件（不编辑两者）：两个文件 mtime/hash 均不变，无关闭提示。

---

## 4. 真实用户编辑仍 dirty / save

在一个**全新副本**（非上面任何已打开副本）中输入一个字符，然后保存。

- [x] 关闭时**弹出**「未保存的更改」（dirty=true 生效）。
- [x] 保存后 mtime 变化、文件内容包含输入的字符（保存正常）。
      → 副本 `manual-edit-utf8-lf.md.md`：正文 `BodyX paragraph`（插入 `X`），
      mtime 1786584675→2026-08-13 09:42:12 变化，保存成功。尾部 `\n\n`→`\n`、
      软换行规范化属 L1 边界（P0S 不解决，如实记录）。
- [x] 保存后再次关闭，不再弹提示（dirty 清除）。

---

## 5. 明确记录范围边界

- [x] 验收记录明确：**P0S 只修复「零编辑错误写盘」，不解决编辑后的 byte-to-byte 保真**。
      编辑正文后 serializer 仍可能规范化软换行/EOL/尾部（L1 失败由 characterization
      如实保留），最终 byte 保真验收在 P1B。
      → 已由本清单记录表与第 4 步观察确认。

---

## 6. 纠偏候选：立即操作边界（2026-08-13 新增，必须重新人工执行）

首轮人工验收没有覆盖用户输入后 `<400ms` 立即操作。请使用**三个全新 Markdown 副本**，不要复用前面已经保存过的文件。

### 6.1 立即 Cmd+S

1. 打开副本 A，输入单个字符 `X`；
2. **不要等待**，立即按 `Cmd+S`；
3. 关闭并重开 A。

- [x] A 重开后包含 `X`，保存没有被错误 `skipped`
- [x] 保存完成后关闭不再提示 dirty

### 6.2 立即 A→B

1. 打开副本 A，输入单个字符 `Y`；
2. **不要等待**，立即在文件树点击副本 B；
3. 在未保存对话框选择“取消”。

- [x] 必须出现 A 的未保存提示
- [x] 取消后仍停留在 A，`Y` 仍存在，B 未被打开
- [x] 再选择“保存”时，只有实际保存成功才允许进入 B；保存失败/取消不得切换

### 6.3 立即关闭

1. 打开副本 C，输入单个字符 `Z`；
2. **不要等待**，立即关闭窗口；
3. 在未保存对话框选择“取消”。

- [x] 必须出现未保存提示
- [x] 取消后窗口保持打开，`Z` 仍存在

### 6.4 人工纠偏结论

- [x] 6.1–6.3 全部通过
- 验收人 / 日期：**xian / 2026-08-13**（验收人于当前对话确认已完成三项立即操作验收）
- Program Owner 是否重新确认 P0S GO：PENDING

---

## 7. 二次纠偏候选：in-flight 保存竞态（2026-08-13 新增，人工已重验）

独立 Reviewer 发现首轮 Section 6 未覆盖「保存 in-flight 后 discard-switch B」竞态（ISSUE-001）。
本二次人工确认使用 `p0s-reverify-20260813/` 隔离副本，验证不保存 → 不写盘、立即 Cmd+S 正常保存。

### 7.1 立即 A→B（不保存 → A 不写盘）— 核心 ISSUE-001 回归

- [x] 打开 `a-switch-test.md`，输入字符，不等待立即点 `b-switch-test.md`
- [x] 弹出「未保存的更改」
- [x] 选「**不保存**」→ 切到 B
- [x] **A 未被写盘**：A 文件 hash/length/mtime 与基线一致（诊断日志确认 `result=discard`，无 `Saved active`）
- [x] 切回 A 时重新加载磁盘原始内容（无输入字符）——「不保存」语义正确

> 附注：验证过程中确认「不保存」会丢弃未保存编辑（X 消失），这是**预期语义**而非数据丢失。
> 首次人工验证时 A 被写盘（两次 `interactive:true` 保存），经诊断日志回溯为首次验证时按钮操作/流程差异；
> 本次修复后日志确认 `result=discard` 且零写盘。

### 7.2 立即 Cmd+S（编辑落盘）

- [x] 打开 `save-immediate-test.md`，输入字符，不等待立即 `Cmd+S`
- [x] 出现「已保存」toast，日志 `Saved active document`（`interactive:true`）
- [x] 文件内容含输入字符（`BodyX paragraph` 等），保存成功未 skipped

### 7.3 二次纠偏人工结论

- [x] 7.1–7.2 全部通过
- 验收人 / 日期：**xian / 2026-08-13**（桌面 E3 二次人工确认）
- 验证目录：`/Users/xian/markflow-test/p0s-reverify-20260813/`
- Program Owner 是否重新确认 P0S GO：**是**（确认后记录于 phases/P0S.md）

---

## 结论

- 首轮人工结论：**PASS**（零编辑路径；历史）
- 当前纠偏候选人工结论：**PASS**（Section 6 + Section 7，xian，2026-08-13）
- 验收人签名 / 日期：**xian / 2026-08-13**
- 首轮是否同意 Program Owner 记录 P0S GO：**是（历史）**
- 当前纠偏候选是否重新同意 P0S GO：**是**（二次人工确认 + 独立 Reviewer PASS）
