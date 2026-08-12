# PM 尾换行丢失 characterization（tasks 1.4）

> 复现命令：`npm run test:characterization`
> 基线：`feat-v0.1.0@6bfba453`；运行环境见 child change 的 validation evidence。

## 结论

当前 ProseMirror 路径在正文编辑后**会改写或丢失文末换行字节**，#189 的
`trailingNewlines` 元数据补偿不满足 L1（surviving-interval byte 保真）。

characterization 测试驱动真实 Tiptap + `tiptap-markdown` serializer，并调用
`src/lib/editor.ts` 的真实 `setMarkdown()`/`getMarkdown()`，再把其序列化输出与
`l1-harness.mjs` 的 L1 oracle 做字节级比较。它是**serializer 级 characterization**，
不是完整产品生命周期：没有覆盖真实 `openFileInEditor`、`setReadOnly/onUpdate`、
autosave timer、`saveActiveDocument()` 和实际文件 write。

因此历史测试仍是有效的 L1 证据，但“真实编辑器栈/保存路径”表述不得被理解为
E3 desktop lifecycle。人工发现的“零编辑打开即 dirty/autosave 写盘”需要独立的
corrective characterization；standalone Editor、L0 oracle self-check 和
`autosave=false` smoke 均不能替代。

> ✅ 该 corrective characterization 已完成：`legacy-open-autosave.characterization.test.ts`
> 驱动真实 open/dirty/autosave/write 链路，保存后 SHA 与人工实测完全一致；
> 证据与替代性证明见 [`docs/lifecycle-open-autosave-characterization.md`](./lifecycle-open-autosave-characterization.md)。

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

## 人工补充根因：零编辑也会写盘

人工实测表明问题不只发生在正文编辑后：`setMarkdown()` 将进入 PM 前的 Markdown
传给 `markDocumentPersisted()`，后者又调用 `getMarkdown()` 取得 PM serializer 输出
回比。段落内 soft break 会被 serializer 变为空格，因此打开阶段本身即可 dirty。
`normalizeImageMarkdown()` 还会把 CRLF 全文转换为 LF；随后 `setReadOnly(false)` 的
`setEditable()` 默认 update 进入延迟 dirty check。产品 autosave 默认开启时，约每
10 秒把该输出写回磁盘。

该结论是新增 P0 corrective scope；现有四个 serializer tests 不能证明该生命周期已
被机器覆盖。

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
