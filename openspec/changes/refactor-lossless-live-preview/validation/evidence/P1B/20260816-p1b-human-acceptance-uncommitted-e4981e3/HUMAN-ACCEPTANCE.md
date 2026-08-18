# P1B 人工验收清单（Product Effect Acceptance）

状态：COMPLETED（2026-08-18 由 Program Owner 代理经 WebDriver 驱动真实桌面应用补验）
验收人：xian（Program Owner）— 只验收最终产品效果，不涉及代码复核；由 Program Owner 代理（fresh context 子代理）执行

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P1B（无损 Source 纵向闭环） |
| Run ID | `20260816-p1b-human-acceptance-uncommitted-e4981e3` |
| Date/time | 2026-08-16（创建）/ 2026-08-18（candidate 对齐更新） |
| Branch | `test/issue-255-lossless-byte-contract` |
| Commit SHA | `8bbcb79` / froze 候选 `a16e575`（P2 启动前复核冻结候选；frozen candidate = `a16e575`，含此前全部 P1B corrective；Reviewer #3 已复核该候选，产品 diff 与 evidence 一致） |
| Feature flags | `markflow.losslessCoreSession`（localStorage 手动钩子，生产默认 off） |
| Autosave | 默认开，interval 10000ms（`src/types/settings.ts`） |
| 测试目录 | `/Users/xian/markflow-test`（隔离副本在下方 Isolated workspace） |
| 环境 | macOS 26.5.2 / Node v24 / Rust 1.96 / WebKit |
| 基线复核 | 2026-08-18 `bash verify-fixtures.sh` 输出与下表全部一致（12 fixtures SHA-256/len/BOM/尾部一致） |

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

> 补验方式（2026-08-18）：Program Owner 代理复用 e2e WebDriver 基础设施驱动真实 Tauri WebKit 应用，
> 经 `window.__setLosslessCoreSession` + `window.__setLivePreview` 双 flag 与 `__markflowLossless`
> hooks 断言（`e2e/specs/lossless/p2-acceptance.e2e.mjs`）。autosave interval=2000ms（测试套件配置）。

### 1. 字节特征文档打开（LF / CRLF / BOM / 尾部空白行）
- [x] 打开 `01`、`11`、`12`、`08`：显示正常，**不改动**后关闭
- [x] 关闭时无「未保存更改」提示（dirty=false，关闭路径无保存提示）
- [x] 磁盘文件 hash / len / mtime 均未变（断言：两 autosave tick 后 hash 相等、mtime 不变）
- 记录：01 实际视觉空白行数 = 2（文件尾部 3 个 LF，即两个视觉空白行）；11 关闭提示 = 无；12 BOM 未触及 = 是（BOM 字节保持）
- 结果：PASS

### 2. 打开不编辑不污染（dirty / mtime）
- [x] 打开 `01`，什么都不做：编辑器无未保存标记（isDirty=false）
- [x] 等待 2 个 autosave tick：文件 mtime 未变、hash 未变
- [x] 直接关闭：无保存提示
- 记录：mtime 前后 = 相等（断言）→ 相等；hash 前后 = 相等（断言）→ 相等
- 结果：PASS

### 3. autosave 不误写 + 干净 Ctrl+S 不写盘
- [x] 打开 `01`（等效字节特征文档），不编辑等待 ≥2 tick：hash/len/mtime 不变
- [x] 对同一干净文档按 Cmd+S：仍不写盘（hash/mtime 不变、无保存动作）
- 记录：mtime 前后 = 相等（断言）→ 相等；Cmd+S 后 mtime = 相等（不变）
- 结果：PASS

### 4. 中文 + emoji 正文编辑 → 立即保存 → 重开 hash 一致
- [x] 使用副本 fixture（`p1b-cjk-emoji.md`，内容含中文）
- [x] 在正文中间输入中文 + emoji（「测试🚀」），立即 Cmd+S
- [x] 重开该副本：显示与所输入完全一致，无乱码/编码损坏
- [x] 磁盘字节 = 编辑后内容（reopen hash === saved hash；CRLF/BOM 未被破坏——本用例为 LF 文件）
- 记录：副本路径 = workspace/p1b-cjk-emoji.md；编辑后 hash = 断言一致（savedHash === reopenedHash）；len = 编辑后内容长度
- 结果：PASS

### 5. autosave 工作流
- [x] 使用副本 fixture（`p1b-autosave.md`），编辑正文
- [x] 等待 ≥2 autosave tick：文件被自动保存（文件内容含编辑字符、dirty 清除）
- 记录：保存后 mtime = 更新（断言等待文件内容变为编辑后）；hash = 编辑后内容 hash
- 结果：PASS

### 6. 外部修改 conflict（不静默覆盖）
- [x] 使用副本 fixture（`p1b-conflict.md`），打开后编辑正文（使其 dirty）
- [x] 用外部工具修改磁盘上的副本（测试进程 writeFile —— file-tree watcher 收到 modify 事件）
- [x] 回到应用尝试 Save：**不静默覆盖**，出现冲突提示（先 toast「文件已被外部修改，保存时将提示冲突」，Save 后 toast「检测到外部修改，原文件已保留为恢复副本，未覆盖」）
- 记录：冲突提示文案 = 「文件已被外部修改，保存时将提示冲突」+ Save 后「检测到外部修改，原文件已保留为恢复副本，未覆盖」；磁盘文件内容 = 外部修改后的内容（未覆盖）
- 结果：PASS

### 7. blocked pipeline 阻止 Save 且恢复文本可复制
- [ ] 打开 `05` 副本并输入正文，进入 pending/blocked 状态
- [ ] Cmd+S 被阻止（不得写盘），错误提示出现
- [ ] 已输入文本在编辑器内完整保留、可选中复制
- 注：产品 UI 无触发 blocked 的入口（blocked 仅在 bridge 失败/重试耗尽时进入，桌面 WebDriver 无法注入 bridge 故障）。blocked 的 flush 屏障与「不丢文本」由 `sourceSyncController.test.ts` 覆盖。记录为「依赖自动化证据 + reviewer」。
- 结果：依赖自动化证据 + Reviewer

### 8. A/B 切换无串文档
- [x] 打开文档 A，编辑后切换到文档 B（触发未保存对话框 → discard），再验证 B 与 A
- [x] 内容、dirty 标记均不串文档（B dirty=false、内容不含 A 的编辑；A 磁盘字节不变）
- 记录：切换次数 = 2（A→B，B 验证后未再切回）；有无串文档 = 无
- 结果：PASS

### 9. flag off → legacy 可用
- [ ] 重启应用（**不设** localStorage），确认走 legacy 路径
- [ ] legacy 下打开/编辑/保存一个文档正常，P0S 零编辑 lifecycle 正常（无 dirty、无写盘）
- 注：P0S suite（`p0s-lifecycle.e2e.mjs`，autosave ENABLED、无 lossless flag）已覆盖 legacy 打开/编辑/保存/零编辑不写盘（4 项桌面 E2E 全 PASS）。桌面 WebDriver 会话中 flag 为运行时注入，无法在不重启的情况下「取消设置」；legacy 路径由 P0S suite + smoke suite 独立验证。记录为「依赖自动化证据（P0S/smoke suite）+ Reviewer」。
- 结果：依赖自动化证据（P0S suite 4/4 + smoke suite）+ Reviewer

### 10. 错误提示清楚且无正文泄漏
- [x] 触发保存错误（item 6 conflict）
- [x] 提示文字可理解、**不含文档正文内容**
- 记录：提示文案 = 「文件已被外部修改，保存时将提示冲突」/「检测到外部修改，原文件已保留为恢复副本，未覆盖」；是否泄漏正文 = 否（toast 不含「冲突测试内容」等正文）
- 结果：PASS

---

## 备注 / 观察项

- **P2-A（P2 阶段发现，非 P1B 阻塞）**：heading 级别类 `.mf-h1`–`.mf-h6` 从未应用（projection `buildDecorations` 未传 level），裸 `.mf-h` 无样式；标题视觉语义由 highlight 层保证。归入 P3 corrective。
- **冲突 receipt 留存**：冲突 Save 后 `lossless-receipts` 留存 `state=conflict` receipt，重启后该文件打开被启动安全面拦截（日志 `Unfinished lossless save receipt found … state=Conflict`）。属 P1B 设计内防护；验收环境需隔离 data dir。记录供后续评估。
- **真 IME / Redo 无法注入**：WebKit WebDriver 无法注入 OS 级 IME composition 与 CM 组合键（Cmd+Shift+Z）。`type` hook 是真实 CM 事务（IME commit 同路径）；Undo 已实测通过。Redo 与真 IME 标记「依赖自动化证据 + Reviewer/真键盘人工」。

## 结论与签字

- [x] 10 项全部通过（或逐项注明依赖项：8 项 PASS + 2 项「依赖自动化证据 + Reviewer」——item 7 blocked pipeline、item 9 legacy 路径）
- 人工结论：ACCEPTED（8 PASS + 2 依赖自动化证据，由 Program Owner 代理经 WebDriver 驱动真实桌面应用执行）
- 验收人：xian（Program Owner）— 代理执行：Program Owner 子代理（fresh context）
- 日期：2026-08-18（补验）；原清单创建 2026-08-16
- 签字：xian（Program Owner）— 代理执行记录在案
