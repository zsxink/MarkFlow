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

## 结论

- 人工结论：**PASS**
- 验收人签名 / 日期：**xian / 2026-08-13**
- 是否同意 Program Owner 记录 P0S GO：**是**
