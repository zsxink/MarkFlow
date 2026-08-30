# `lossless-acceptance` 套件已腐烂：失败且不稳定（P2 遗留债，非 P4B 引入）

状态：**OPEN — 已取证，不阻塞 P4B-GO；归属 P2/P1B 遗留债，需 Program Owner 裁决修复归属**

| 字段 | 值 |
| --- | --- |
| Issue ID | `P4B-LOSSLESS-ACCEPTANCE-SUITE-ROTTED` |
| Severity | Process / test-debt（证据完整性），**非**产品功能缺陷 |
| 发现于 | P4B corrective run `20260830-111403-p4b-clipboard-75afebe` 准备阶段 |
| 发现方式 | 独立 Reviewer F-10 指出该套件没有任何 gate，执行流探测后确认 |
| Suite | `e2e/specs/lossless/all-lossless-acceptance.e2e.mjs`（→ `p2-acceptance.e2e.mjs`） |
| Runner | `node e2e/run-lossless-acceptance.mjs` |

## 背景：为什么会暴露出来

`e2e/wdio.conf.mjs` 定义了 6 个套件，而 P4B 的 20 gate 只覆盖了 `lossless` / `smoke` /
`regression` / `p0s` / `ime` 五个，**`lossless-acceptance` 从无对应 gate**。
独立 Reviewer（F-10）指出这一点后，执行流在把它纳为 gate 之前先做了探测 —— 结果它不是「缺 gate」，
而是「套件本身已经跑不过了」。

## 实测：两次独立运行均失败（EXIT=1）

| 运行 | HEAD / 测试文件状态 | 结果 | 耗时 |
| --- | --- | --- | --- |
| 探测 1 | `75afebe`，**含** P4B 新增选区 copy/cut 断言 | 2 passing / **13 failing**，EXIT=1 | 5m58s |
| 对照 2 | 同一 HEAD，但 `p4b-widgets.e2e.mjs` **回退到 `b50e392`**（不含新断言） | 10 passing / **5 failing**，EXIT=1 | 3m09s |

**结论：与 P4B 本次改动无关。** 依据：
1. 两次运行 EXIT 均为 1；
2. `all-lossless-acceptance.e2e.mjs` 只 `import { registerP2AcceptanceTests } from './p2-acceptance.e2e.mjs'`，
   **不导入** `p4b-widgets.e2e.mjs`，该套件根本不在被改动的模块路径上；
3. 对照运行移除了新断言，仍然失败。

**同时确认该套件不稳定**：两次运行的失败集合不同（13 vs 5）。探测 1 的失败从 P2-3 开始全线下滑，
对照 2 只失败 P2-3 / P2-4 / P1B-5 / P1B-8 / P1B-10。这不是确定性失败，是 flaky。

## 失败形态

13 条（探测 1）中**全部**为同一形态：

```
Expected active document to be <fixture>.md
    at openFileAndWaitActive (e2e/specs/lossless/p2-acceptance.e2e.mjs:67:7)
```

`openFileAndWaitActive` 会重试 3 次；每次先调 `openFileInTree(name)`，再等 `activeFilePath` 匹配。
报错是「active document 不是目标文件」而**不是**「找不到元素」——说明**文件树项找到了也点了，
但应用没有切换文档**。

只有不切换文档的用例（P2-1、P2-2）稳定通过。

## 拟议根因（待验证，不要当结论用）

最可能：**P2-2 在 marker 内输入后文档变脏且未保存**，其后任何切换文件的操作被
「未保存变更」对话框挡住，`activeFilePath` 因此不更新。P3 之后引入了未保存变更守卫，
而该套件的用例序列仍按「无守卫」编写 —— 属 harness 跟不上产品演化的典型腐烂。

次要可能：`data-path` 属性格式或文件树渲染契约变更。但若是这个原因，
`lossless` 套件（同样使用 `openFileInTree`，30 passing）也会失败，故可能性较低。

**该根因尚未验证。** 验证它需要单独投入一轮桌面运行，且不属于 P4B 范围。

## 处置决定（以及为什么）

**不把 `lossless-acceptance` 纳为 P4B 的 gate。** 理由：

1. 它是 **P2/P1B 的验收套件**，不是 P4B 的交付范围；让 P4B 的 Go 卡在 P2 的遗留债上，
   等于用后置阶段的 gate 倒扣前置阶段，治理上说不通。
2. 它 **flaky**。把一个已知不稳定的套件设为 gate，会让每次 corrective run 都可能因无关原因变红，
   反而削弱 gate 的信号价值。
3. 独立 Reviewer F-10 给出的正是两个选项：「建 gate **或**显式声明其不在范围内」——此处取后者，
   并留下本 issue 作为证据与追踪入口。

**代价（如实记录）**：这意味着 P2-3「选区复制产出 Markdown source」这条用例**不在 P4B 的任何 gate 内**。
P4B 已用新增的选区 copy/cut 断言（`p4b-widgets.e2e.mjs`）覆盖同一合同，
但 P2-3 本身及其所属的 15 条 P1B/P2 验收用例目前**无自动化回归保护**。

## 待办

- [ ] Program Owner 裁决：该套件修复归入哪个阶段（建议 P7 收口或单开技术债 issue）
- [ ] 修复时验证上述拟议根因，不要跳过
- [ ] 修复后为它建立独立 gate，并纳入后续所有阶段的 gate 集

## 复现方式

```bash
cd /Users/xian/Project/book/MarkFlow
NODE_OPTIONS= node e2e/run-lossless-acceptance.mjs
```

前置条件：`/Users/xian/markflow-test/` 必须存在（runner 会从中拷贝 4 个 P1B 字节特征 fixture）；
缺失会导致更早的失败且原因不同。
