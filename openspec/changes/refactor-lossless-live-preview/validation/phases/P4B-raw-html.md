# P4B-ITEM: raw HTML policy（task 7.6，design 05 §7）

> P4B.md 要求「每个 construct 必须复制本记录为 `P4B-<construct>.md`」；本文件即为 raw HTML 项。
> 单项裁决 `P4B-ITEM-rawHtmlPolicy-GO/NO-GO` 由主会话在 Reviewer + 人工验收 + Program Owner 齐备后记录，
> 执行流不自我批准。

## Identity

| 字段 | 值 |
| --- | --- |
| Construct | 文档内嵌原始 HTML |
| Flag | `rawHtmlPolicy`（`src/lib/lossless/cohortFlags.ts:185` `isRawHtmlPolicyEnabled()`） |
| **Default** | **OFF** |
| Maturity | **policy pilot** —— 7.6 策略项，不是 widget |
| Fallback | **source-only / inert** —— 默认不渲染、不执行；策略 flag 回滚必须惰性 |
| Run ID | `20260830-113140-p4b-clipboard-b91de0e`（最新全 gate run） |
| Commit | `b91de0e`（最新，仅补证据）；历史 `7869de8` / `ec718b4` |
| Branch | `test/issue-255-lossless-byte-contract` |

## 安全性质（本项与其他三项不同）

本项的核心交付是**安全约束**而非交互增强：原始 HTML 默认以源码呈现且保持惰性（不执行脚本、
不加载远程资源）。`design/05-render-ir-widgets-nfr.md:90` 要求 clipboard HTML 必须 sanitize。
因此本项的验收权重在「不执行 / 不泄出」上，高于「好不好用」。

## 证据

### 单元测试（C01，EXIT=0；16 files / 433 tests）

- `src/lib/lossless/policy/rawHtmlPolicy.test.ts`（15）—— 策略判定与 sanitize 边界
- `src/lib/lossless/widgets/protocol.test.ts`（16）、`p4bWidgets.test.ts`（26）—— widget 不进入 raw HTML 区域
- `src/lib/lossless/cohortFlags.test.ts`（11）—— flag 回滚惰性

### 桌面 E2E（C15，EXIT=0；30 passing）

- `raw HTML is source-only by default and remains non-executable; policy flag rollback is inert`
- `toolbar HTML export uses lossless source and never serializes widget DOM`
  （导出走源码，widget DOM 不进入导出产物 —— 与本项的「不泄出」要求同源）

### 字节合同（C10，EXIT=0）

L0 `24/23`、L1 `95/93`、`"pass": true`。raw HTML 以精确源码保存，无字节变换。

## 已知缺口

1. **「不执行」的证据是一句断言，没有行为级验证**：桌面用例断言
   `non-executable`，但验证方式是检查 DOM 形态，未实际注入 `<script>` 或
   `onerror` 并观察其是否触发。对安全性质而言这是**证据强度不足**，
   建议 Reviewer 判断是否需要一条「注入事件处理器并断言未触发」的用例。
2. **远程资源加载未验证**：`<img src="http://...">` 之类是否被阻止加载，无任何断言。
3. **本项区域的选区 copy 仍无证据**（全局缺口已闭合，本项未闭合）：
   2026-08-30 新增的选区 copy/cut 断言用的是 fence fixture，**未覆盖 raw HTML 区域**。
   对 raw HTML 而言这条更敏感 —— 复制结果必须是**原始 HTML 源码**而不是被 sanitize 后的文本，
   否则用户复制即丢内容。目前无断言。
4. **clipboard HTML sanitize 无断言**：`design/05` §4/§7 要求 clipboard HTML 必须 sanitize，
   本项无任何对 `text/html` payload 的断言（现有断言只覆盖 `text/plain` 与 widget 路径）。

## 裁决

| 角色 | 结论 |
| --- | --- |
| AI 编码验证 | PASS（C01 / C15 / C10 全绿） |
| 独立 Reviewer | **PENDING** |
| 人工验收 | **PENDING** |
| `P4B-ITEM-rawHtmlPolicy-GO/NO-GO` | **PENDING —— 不自我批准** |
