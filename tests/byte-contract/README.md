# byte-contract harness

P0 lossless byte contract 的验证工具。所有脚本确定性地操作字节，不使用
trim/normalize 后的字符串比较代替 byte 比较。

## 目录

```text
tests/byte-contract/
  generate-fixtures.mjs              # 确定性生成 canonical fixtures
  l0-harness.mjs                     # L0 无编辑 byte-for-byte 判定
  l1-harness.mjs                     # L1 surviving-interval 判定
  pm-tail-newline.characterization.test.ts  # PM 尾换行丢失复现（预期失败）
tests/fixtures/byte-contract/
  fixtures/*.md                      # 合成 fixture 原字节
  manifest.json                      # path/length/sha256/bom/eol/trailing
  l1-intents.json                    # 声明的 edit intent（源字节偏移）
```

## 命令

```bash
# 生成/校验 fixtures（确定性，重复运行 hash 稳定）
npm run fixtures:generate
npm run fixtures:generate -- --verify

# L0/L1 self-check（oracle + negative controls）
npm run test:byte-contract

# PM 尾换行丢失 characterization（基线预期失败）
npm run test:characterization
```

## 语义

- **L0**：无正文 transaction 的打开→保存，输出与输入 bytes 全等
  （sha256、length、byte diff 均相等）。`l0-harness.mjs <input> <output>`。
- **L1**：对声明的 `replace(old[start..end], inserted)`，未触及的
  prefix/suffix/存活 span 必须逐字节一致；只有 replacement range 与新增
  bytes 可变。`l1-harness.mjs <input> <output> <intent.json>`。
- **Negative control**：故意损坏一个未触及 byte，harness 必须失败
  （self-check 内置对每个 fixture × intent 执行）。
- **BOM / 尾部换行边界 / EOL entries** 单独断言，见 `verifyL1` 输出的
  `bomPreserved` / `trailingPreserved`。
- 尾部「boundary 数」按行尾换行边界计（`\r\n\r\n` = 2），不是渲染后的
  视觉空白行数。

## 与 /Users/xian/markflow-test 的关系

fixtures 全部合成生成，不读取、不写入 `/Users/xian/markflow-test`。
该目录仅作为人工打开 Markdown 测试文档的样本来源。
