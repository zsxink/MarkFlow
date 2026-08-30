# ENVIRONMENT — 20260830-134007-p4b-acceptance-full-b1e4c05

## 1. 本次 run 是什么

对 P4B 人工验收 harness（三 spec）的**一次完整全量重跑**，spec 版本 = **改后版**
（即 `specs/2-editing.e2e.mjs` 含 `hidCommit` 显式 `Return` 提交与
`composingBefore` / `perKeyTrace` / `composingAfterCommit` 观测的那一版）。

**为什么要跑**：Reviewer-2 Round 3 提出 blocker **B-4**，指出
`20260830-122241-p4b-human-acceptance-1f1bd3c` 的 accept 结论来自
「改前 spec 全量 run 失败 → 改 spec → 改后 spec 隔离重跑通过」，
两次 run 之间**同时**变了隔离状态与 spec 版本，属混淆对比，
不能作为根因依据，也不能作为「人工验收通过」的出处。
Reviewer 的原话是：「两条路都行，但不能既改 spec、又不披露、又不重跑。」
本 run 取「重跑」这条路，用一个 unconfounded 的全量 run 取代该对比。

## 2. 被测对象

| 项 | 值 |
| --- | --- |
| 分支 | `test/issue-255-lossless-byte-contract` |
| HEAD | `b1e4c05`（`docs: N-3 机制定案 —— 两次 run 跑的不是同一版 spec`） |
| 产品源码最新改动 | `b50e392` @ 2026-08-30 09:18:16 |
| **产品源码 vs `b50e392` 的改动** | **0 文件**（本 run 之前所有提交均只动 docs / scripts / CI / evidence） |
| 产物 | `src-tauri/target/debug/markflow` |
| 产物 mtime | 2026-08-30 11:42:13（新于 `b50e392`，故对 HEAD 有效） |
| 产物 sha256 | `8da6a6053043a5ddf6ac64a3d20524f4ee58d3ae27945e3c873839dcbc609059` |

## 3. 运行环境

| 项 | 值 |
| --- | --- |
| OS | macOS 26.5.2 (Build 25F84) |
| Node | v22.22.2（`/Users/xian/.workbuddy/binaries/node/versions/22.22.2-2/bin/node`） |
| 驱动 | Tauri embedded WebDriver，port 4445 |
| 键盘布局 | ABC（US） |
| 输入法 | 已启用日文（Kotoeri）与中文 Input Mode，与 `122241/` 同机同配置 |
| E2E 数据目录 | `/tmp/p4b-acc/data` |
| E2E 工作区 | `/tmp/p4b-acc/ws` |
| 桥接方式 | Quartz HID tap（`.cghidEventTap`，`postToPid`），**绕过** Text Input Services |

## 4. Harness 指纹

harness 原始位置 `/tmp/p4b-acc`（**临时目录，重启可失**）。
本 run 把用到的 5 个文件快照进 `specs/`，使证据自包含。

| 文件 | sha256 |
| --- | --- |
| `specs/1-clipboard.e2e.mjs` | `482aeb2dbef236f2fc5023bd60966fafbbd966b1dd267bd2adad2f02e507c181` |
| `specs/2-editing.e2e.mjs` | `701d5baf04fe4a180b0f0e9b7b4ba218132dbd9b244cdf4611232bb271602936` |
| `specs/3-visual-a11y-security.e2e.mjs` | `7c863a2919086d841a58ee3221003931da3844850432aaacaad1e305ed986a53` |
| `specs/lib.mjs` | `49eaec4d68ff2bfa89db31821048baf7a3c8eabc09832c0a40eed722d6c7b86a` |
| `specs/wdio.conf.mjs` | `4918d9993b83e4cdbb430ba337b8642d42878b19780f415c98ef29e3651571f2` |

与 `122241/` 的 `run2.log`（改后 spec 隔离重跑）比对：
`2-editing.e2e.mjs` 的 sha256 **一致**即证明本 run 用的是同一版改后 spec。

## 5. 与历史 run 的关系

| run | spec 版本 | 隔离 | 用途 |
| --- | --- | --- | --- |
| `122241/` 的 `run.log` | **改前** | 三 spec 同进程 | 首次全量（3 项失败） |
| `122241/` 的 `run1/2/3.log` | 改后（仅 2 改过） | 单 spec 隔离 | 逐项隔离重跑 |
| **本 run** | **改后（三 spec 同版本）** | **三 spec 同进程** | **unconfounded 全量复现** |

本 run 是历史上**第一次**「改后 spec + 全量三 spec 同进程」的组合。
若通过，则 item 2 / 3 / 6 的 accept 结论获得与首次全量 run 同口径的证据，
`122241/` 的混淆对比不再被引用为根因依据。

## 6. 本次 run 的局限（先声明，跑完不改）

1. **不修复 B-4 ③**：`composing` 仅在 `compositionend` 复位（失焦不复位）这一产品事实，
   本 run 不覆盖「未提交 composition 时按 Cmd+Z」的场景——改后 spec 显式绕开了它。
   该场景零覆盖，作为 **P6 open item** 另行登记。
2. harness 依赖 macOS 无障碍授权与前台应用（`becameFrontmost`）。
   若被其他窗口抢占前台，HID 投递会静默失败。本 run 期间需保持机器不被抢占。
3. 系统 pasteboard 的端到端（Cmd+C → 外部应用粘贴）本 run 仍无法自动断言。
