# P1B 人工验收清单（Product Effect Acceptance）

状态：READY（基线已预录，待 Program Owner 逐项执行）
验收人：xian（Program Owner）— 只验收最终产品效果，不涉及代码复核

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P1B（无损 Source 纵向闭环） |
| Run ID | `20260816-p1b-human-acceptance-uncommitted-e4981e3` |
| Date/time | 2026-08-16 |
| Branch | `test/issue-255-lossless-byte-contract` |
| Commit SHA | `e4981e3`（HEAD）+ 工作树未提交 corrective 17 文件（桌面 E2E corrective run 已验证此工作树） |
| Feature flags | `markflow.losslessCoreSession`（localStorage 手动钩子，生产默认 off） |
| Autosave | 默认开，interval 10000ms（`src/types/settings.ts`） |
| 测试目录 | `/Users/xian/markflow-test`（隔离副本在下方 Isolated workspace） |
| 环境 | macOS 26.5.2 / Node v24 / Rust 1.96 / WebKit |

## 启动与开启 flag

1. `npm run tauri dev`（编译 Rust + 打开应用窗口）
2. 窗口内打开 DevTools（Cmd+Option+I）→ Console：
   ```js
   localStorage.setItem('markflow.losslessCoreSession', '1'); location.reload();
   ```
3. 刷新后 lossless 路径生效。文档只读使用；需要保存的用例先复制到隔离 workspace。

## Isolated workspace

保存类用例使用副本，不动 `/Users/xian/markflow-test` 原件：

```text
/Users/xian/markflow-test/manual-acceptance-p1b-20260816/   ← 复制后在此操作
```

## Fixture 基线（2026-08-16 预录，验收开始前复核一遍）

| Fixture | SHA-256 | len | BOM | EOL | 尾部 boundary |
| --- | --- | --- | --- | --- | --- |
| 01-trailing-two-blank-lines.md | `9eff8adb3b2dcc5e4a9fe8ffd493fdbbd5cb077b1100713a13bd41f76ccefde7` | 22 | no | LF | 3 个 LF（两个视觉空白行） |
| 02-basic-live-preview.md | `e3ffa84526457611df90d3e9d4931c905121c4bf8e874b7616b6e18bc3314be8` | 737 | no | LF | 1 个 LF |
| 03-selection-and-ime.md | `6e04e0e5fee3ac836eeff8dd9c579a637cdd2f4f20001c8c12bf2cae899aec9c` | 798 | no | LF | 1 个 LF |
| 04-enter-backspace-structures.md | `bc168cc66dbd432f0106cf83480bd087e6edd5b0f5ebfaef067bbe4b9f3b6578` | 572 | no | LF | 1 个 LF |
| 05-paste-targets.md | `0aace1ce5fdac70f1b558b856d0233fcc1a462c9ff744dabbbbb1ca056059432` | 749 | no | LF | 1 个 LF |
| 06-tasks-images-tables.md | `4784e55a9c968e3bbef0c27a09117e632ed416242da4d830fb989c783d2d0d7e` | 758 | no | LF | 1 个 LF |
| 07-references-footnotes.md | `da51ba2fd5dad9b26a56322c157b683ea1acb323c9c1495620e3fb5168ff4891` | 496 | no | LF | 1 个 LF |
| 08-malformed-source-fallback.md | `e116fe226ce670e3bb5607596c64682539eda618da7aee5b9c3913c6097e4ddf` | 499 | no | LF | 2 个 LF |
| 09-diagrams-and-raw-html.md | `8713625e1683357761066751014be9b6092d7e5624dba5916651a5ca50d66a34` | 538 | no | LF | 1 个 LF |
| 10-empty-lines-around-content.md | `005418b592d23224f6a00bd63d562e14cabfa68a252c7b890d9e7544ea988b89` | 370 | no | LF | 1 个 LF |
| 11-crlf-trailing-blank-lines.md | `dd8deffedd46cbe574871a7edb7d02a42d01fd59f9bbd47274908d370796ce55` | 92 | no | CRLF×5 | 3 个 CRLF boundary |
| 12-utf8-bom.md | `e85eaae65dc70ee9cb20902eee94bcdaa25346c8b51c21d7c5ea6c09be8f6a0c` | 91 | **BOM** | LF | 1 个 LF |

复核：`bash verify-fixtures.sh` 输出应与上表一致。

---

## 验收项（逐项打勾，记录观察值）

### 1. 字节特征文档打开（LF / CRLF / BOM / 尾部空白行）
- [ ] 打开 `01`、`11`、`12`、`08`：显示正常，**不改动**后关闭
- [ ] 关闭时无「未保存更改」提示
- [ ] 磁盘文件 hash / len / mtime 均未变（`bash verify-fixtures.sh` 复核）
- 记录：01 实际视觉空白行数 = ____；11 关闭提示 = ____；12 BOM 未触及 = ____
- 结果：PASS / FAIL（失败写 issue）

### 2. 打开不编辑不污染（dirty / mtime）
- [ ] 打开 `01`，什么都不做：编辑器无未保存标记（标题无 ● / 状态栏无 dirty）
- [ ] 等待 2 个 autosave tick（≥20s）：文件 mtime 未变、hash 未变
- [ ] 直接关闭：无保存提示
- 记录：mtime 前后 = ____ → ____；hash 前后 = ____ → ____
- 结果：PASS / FAIL

### 3. autosave 不误写 + 干净 Ctrl+S 不写盘
- [ ] 打开 `10`，开启 autosave（默认已开），不编辑等待 ≥2 tick：hash/len/mtime 不变
- [ ] 对同一干净文档按 Cmd+S：仍不写盘（hash/mtime 不变、无保存动作）
- 记录：mtime 前后 = ____ → ____；Cmd+S 后 mtime = ____
- 结果：PASS / FAIL

### 4. 中文 + emoji 正文编辑 → 立即保存 → 重开 hash 一致
- [ ] 复制 `03-selection-and-ime.md` 到隔离 workspace
- [ ] 在正文中间输入中文 + emoji（如「测试🚀」），立即 Cmd+S
- [ ] 重开该副本：显示与所输入完全一致，无乱码/编码损坏
- [ ] 磁盘字节 = 编辑后内容（`shasum -a 256` 复核，与编辑预期一致；CRLF/BOM 未被破坏）
- 记录：副本路径 = ____；编辑后 hash = ____；len = ____
- 结果：PASS / FAIL

### 5. autosave 工作流
- [ ] 复制 `02` 到隔离 workspace，编辑正文
- [ ] 等待 ≥2 autosave tick：文件被自动保存（mtime 更新、hash 变为编辑后内容、dirty 清除）
- 记录：保存后 mtime = ____；hash = ____
- 结果：PASS / FAIL

### 6. 外部修改 conflict（不静默覆盖）
- [ ] 复制 `04` 到隔离 workspace，打开后编辑正文（使其 dirty）
- [ ] 用外部工具（TextEdit / `echo ... >>`）修改磁盘上的副本
- [ ] 回到应用尝试 Cmd+S：**不得静默覆盖**，应有冲突提示/拒绝
- 记录：冲突提示文案 = ____；磁盘文件内容 = ____
- 结果：PASS / FAIL

### 7. blocked pipeline 阻止 Save 且恢复文本可复制
- [ ] 打开 `05` 副本并输入正文，进入 pending/blocked 状态
- [ ] Cmd+S 被阻止（不得写盘），错误提示出现
- [ ] 已输入文本在编辑器内完整保留、可选中复制
- 注：若产品 UI 无触发 blocked 的入口，记录为「依赖自动化证据 + reviewer」并在备注说明
- 结果：PASS / FAIL / 依赖自动化证据

### 8. A/B 切换无串文档
- [ ] 打开文档 A，快速切换到文档 B，再切回 A
- [ ] 内容、dirty 标记、错误提示均不串文档（A 编辑不影响 B 的 dirty）
- 记录：切换次数 = ____；有无串文档 = ____
- 结果：PASS / FAIL

### 9. flag off → legacy 可用
- [ ] 重启应用（**不设** localStorage），确认走 legacy 路径
- [ ] legacy 下打开/编辑/保存一个文档正常，P0S 零编辑 lifecycle 正常（无 dirty、无写盘）
- 记录：legacy 保存后 hash 与编辑一致 = ____
- 结果：PASS / FAIL

### 10. 错误提示清楚且无正文泄漏
- [ ] 触发至少一个保存错误（如 item 6 conflict）
- [ ] 提示文字可理解、**不含文档正文内容**
- 记录：提示文案 = ____；是否泄漏正文 = ____
- 结果：PASS / FAIL

---

## 备注 / 观察项

（验收中发现的问题、与预期不符的行为、无法触发需依赖自动化证据的项，写这里）

## 结论与签字

- [ ] 10 项全部通过（或逐项注明依赖项）
- 人工结论：ACCEPTED / REJECTED
- 验收人：xian
- 日期：2026-08-16
- 签字：______
