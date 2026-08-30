# Immutable Environment Snapshot

| Field | Value |
| --- | --- |
| Captured | 2026-08-30T11:34:50+08:00（**第一条 gate 之前**；见 RUN.md「Run hygiene」） |
| Repository | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Base HEAD | `b91de0e2c67839a6b47678996fb2647c3dd42eda` |
| Candidate | P4B corrective #2: 选区 copy/cut clipboard 断言 + F-1/F-2/F-7/F-8/F-9 记录更正 |
| Candidate implementation/test diff SHA-256 | `3152d359a7fc59fca420f14e87d97097720bcb4e324f1ca8a30ccefef57885af` |
| Supersedes | `20260830-102354-p4b-ime-7869de8` — 补选区 copy/cut 证据并登记 F-1 回写事实 |
| Product source delta vs base `b50e392` | **none** — `src/`、`src-tauri/`、`markflow-core/` 与 `b50e392` 逐字节一致（`git diff --stat` 输出 0 行） |
| Change vs base | E2E harness（`e2e/**`）与 validation 记录 |
| OS | macOS 26.5.2 (25F84), arm64 |
| Node / npm | v22.22.2 / 10.9.7（managed runtime，与 `102354` run 相同口径） |
| TypeScript / Vite / Vitest | 5.9.3 / 5.4.21 / 2.1.9 |
| Rust / Cargo | 1.96.0 / 1.96.0 |
| Tauri CLI / WebKit | 2.11.3 / 605.1.15 |
| OpenSpec CLI | 1.6.0 |
| Flags | lossless Core + Live Preview ON; P4B item flags independently OFF/ON/rollback |
| Workspace | generated isolated E2E files only; autosave 2s in lossless suite |
| Dirty at capture | 仅两个未跟踪项：`validation/GOAL-executor-typora-complete.md`（用户供给，保持未跟踪）与本 run 目录自身 |

## Hash 口径

```
git diff --no-color --no-ext-diff b50e392 b91de0e -- . \
  ':(exclude)openspec/changes/refactor-lossless-live-preview/validation' | shasum -a 256
```

排除 validation artifacts 与用户供给的 GOAL 文件（后者本就未跟踪，`git diff` 天然不含）。
落入 hash 的实际改动共 5 个文件、754 insertions / 110 deletions：

| File | Δ |
| --- | --- |
| `e2e/ime/activate.swift` | +202 |
| `e2e/run.mjs` | +19/-… |
| `e2e/specs/lossless/p4b-real-ime.e2e.mjs` | +538/-… |
| `e2e/specs/lossless/p4b-widgets.e2e.mjs` | +100 |
| `e2e/wdio.conf.mjs` | +5/-… |

**产品源码零变更是本 run 的关键事实**：本次 corrective 只补证据与记录，没有触碰
`src/`、`src-tauri/`、`markflow-core/` 任一字节。因此上一 run（`102354`）已经跑过的
产品行为 gate 结论在代码层面仍然成立，本 run 重跑是为了给出**带退出码**的完整记录。

## Real IME harness prerequisites (measured, not assumed)

| Prerequisite | Value |
| --- | --- |
| GUI session | unlocked; `/dev/console` owner = `xian` |
| Accessibility trust | `AXIsProcessTrustedWithOptions` → **true**（`activate --info` → `accessibilityTrusted: true`） |
| Activation | `NSRunningApplication.activate(.activateIgnoringOtherApps)` → frontmost |
| Key delivery | `CGEvent.post(tap: .cghidEventTap)` — required，因为 `postToPid` 绕过 Text Input Services，不经过 IME |
| Input source enumeration | Text Input Services（`TISCreateInputSourceList`）— **320 sources**（实测，与 `102354` 一致） |
| Chinese source | `com.apple.inputmethod.SCIM.ITABC` → **PRESENT** |
| Japanese source | `com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese` → **PRESENT**（须先 `TISEnableInputSource` 再 `TISSelectInputSource`） |

`com.apple.HIToolbox.plist` 依旧**不**作为依据：它是陈旧缓存，会把日文 Kotoeri 报成
不存在，从而把 7.3 悄悄降级成只有中文的 run。

`--info` 在采集瞬间报 `frontmost: WorkBuddy`（IDE）——这是采集时的前台应用，不代表
gate 执行时的状态；`ime` 套件自身会用 `activate(.activateIgnoringOtherApps)` 把
MarkFlow 拉到前台。
