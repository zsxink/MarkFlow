# PM 尾换行丢失 characterization（tasks 1.4）

> 复现命令：`npm run test:characterization`
> 基线：`feat-v0.1.0@6bfba453`；运行环境见 child change 的 validation evidence。

## 结论

当前 ProseMirror 路径在正文编辑后**会改写或丢失文末换行字节**，#189 的
`trailingNewlines` 元数据补偿不满足 L1（surviving-interval byte 保真）。

characterization 测试驱动**真实编辑器栈**：真实 Tiptap + `tiptap-markdown`
serializer，注入到 `src/lib/editor.ts` 的真实 `setMarkdown()`/`getMarkdown()`
函数，再把保存路径输出与 `l1-harness.mjs` 的 L1 oracle 做字节级比较。

## 实测证据（fixture 与 oracle/saved 尾部）

| fixture | 源尾部（oracle） | 保存后尾部 | 失败类型 |
| --- | --- | --- | --- |
| `utf8-crlf-tail2` | `\r\n\r\n` | `\n` | CRLF 边界被改成 LF 且**边界数低估**（应为 2，补偿只补 1 个 `\n`） |
| `utf8-crlf-tail3` | `\r\n\r\n\r\n` | `\n` | 同上（3 个 CRLF 边界 → 1 个 LF） |
| `utf8-cr-tail1` | `\r` | `''`（丢失） | 孤立 CR 尾换行被完全丢弃，补偿补不回 |
| `utf8-lf-tail3`（用户显式删除尾部） | 用户意图：尾部删除 | `line.\n\n\n` | 陈旧元数据把用户已删除的 3 个 `\n` 边界**重新补回** |

## 根因

`setMarkdown()` 用 `content.match(/\n+$/)` 捕获尾部换行数：

- 对 LF 尾部，`\n+$` 能匹配全部尾部 `\n`，count 正确（但仍是「计数补偿」，
  不是 byte 保真）。
- 对 CRLF/CR 尾部，`\n+$` 只匹配最后一个 `\n`（前面被 `\r` 隔断），count
  **低估**边界数；且补偿一律补 `'\n'.repeat(tn)`（LF），不保留 `\r\n`/`\r`。
- 对用户显式增删尾换行，元数据在打开时冻结，保存时把陈旧 count 补回，
  覆盖用户意图。

因此 #189 的元数据方案只能对「LF 尾部 + 不触碰尾部 + 保存」的窄场景掩盖症状，
无法满足设计 01 的 L1 合同（未触及 BOM/EOL 边界/尾部换行必须保留原字节）。

## 为什么这是 L1 违约而不是「测试写错了」

L1 oracle 只做一件事：`output == input[0..from] + inserted + input[to..]`，
即只把声明编辑的范围改了。正文编辑的 intent 不覆盖尾部，因此尾部必须原样。
保存路径没有做到这一点（CRLF→LF、count 低估、CR 丢失、陈旧补回），
故为 byte 级 L1 违约。`verifyL1` 同时单独断言 `bomPreserved` 与
`trailingPreserved`。

## 复现机制说明

characterization 测试**预期在基线失败**（这正是它要证明的），因此它：
- 放在默认 vitest include（`src/**/*.test.ts`）之外，运行于独立 config
  `vitest.characterization.config.ts`，只通过 `npm run test:characterization` 执行；
- 不在 `npm test` 中成为长期红色测试；
- 断言的是「当前路径确实违反 L1」，测试自身 pass（即违约被捕获），
  同时把 input/saved/oracle SHA 与尾部 hex diff 写入 stdout 供证据使用。
