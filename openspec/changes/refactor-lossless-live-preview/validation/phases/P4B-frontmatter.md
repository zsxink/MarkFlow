# P4B-ITEM: frontmatter policy（task 7.6）

> P4B.md 要求「每个 construct 必须复制本记录为 `P4B-<construct>.md`」；本文件即为 frontmatter 项。
> 单项裁决 `P4B-ITEM-frontmatterPolicy-GO/NO-GO` 由主会话在 Reviewer + 人工验收 + Program Owner 齐备后记录，
> 执行流不自我批准。

## Identity

| 字段 | 值 |
| --- | --- |
| Construct | YAML FrontMatter（`---` 块） |
| Flag | `frontmatterPolicy`（`src/lib/lossless/cohortFlags.ts:181` `isFrontmatterPolicyEnabled()`） |
| **Default** | **OFF** |
| Maturity | **policy pilot** —— 7.6 策略项，不是 widget |
| Fallback | **exact-source fallback** —— 解析器无 FrontMatter 支持（parser gap），
> 一律以精确源码呈现，不做语义投影 |
| Run ID | `20260830-113140-p4b-clipboard-b91de0e`（最新全 gate run） |
| Commit | `b91de0e`（最新，仅补证据）；历史 `7869de8` / `ec718b4` |
| Branch | `test/issue-255-lossless-byte-contract` |

## 范围说明（避免与 P6 混淆）

P4B **不**为 FrontMatter 提供语义渲染。该项交付的是「**遇到 parser gap 时如何安全地退化**」
这一策略：精确源码 + 字节保全，且策略 flag 的回滚必须是惰性的（不写盘、不改 doc）。
FrontMatter 的语义呈现属后续范围。

## 证据

### 单元测试（C01，EXIT=0；16 files / 433 tests）

- `src/lib/lossless/widgets/p4bWidgets.test.ts`（26）—— 含 FrontMatter 精确源码退化路径
- `src/lib/lossless/projection.test.ts`（34）—— 投影与退化
- `src/lib/lossless/cohortFlags.test.ts`（11）—— flag 回滚惰性

### 桌面 E2E（C15，EXIT=0；30 passing）

- `FrontMatter parser gap uses exact-source fallback and preserves bytes`
- 共享：`widget failure injection falls back to exact source and flag rollback removes controls`
  覆盖「策略 flag 回滚是惰性的」

### 字节合同（C10，EXIT=0）

L0 `24/23`、L1 `95/93`、`"pass": true`。FrontMatter 为精确源码，不产生任何字节变换。

## 已知缺口

1. **只有「退化路径」的证据，没有「策略开启后行为」的证据**：因为 flag ON 时本就无语义投影，
   所以「flag ON 与 OFF 行为一致」这件事没有被显式断言 —— 两者都走精确源码。
   建议 Reviewer 判断是否需要一条「ON/OFF 快照等价」断言。
2. **本项区域的选区 copy 仍无证据**（全局缺口已闭合，本项未闭合）：
   2026-08-30 新增的选区 copy/cut 断言用的是 fence fixture，**未覆盖 FrontMatter 区域**。
3. **FrontMatter 内 IME 输入**：未验证（7.3 基线只覆盖 `# marker` / `> marker` 邻域）。

## 裁决

| 角色 | 结论 |
| --- | --- |
| AI 编码验证 | PASS（C01 / C15 / C10 全绿） |
| 独立 Reviewer | **PENDING** |
| 人工验收 | **PENDING** |
| `P4B-ITEM-frontmatterPolicy-GO/NO-GO` | **PENDING —— 不自我批准** |
