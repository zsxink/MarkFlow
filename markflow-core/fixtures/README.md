# Fixtures

MarkFlow 测试工具（lossless 测试、benchmark）使用的 Markdown fixture 文件。

## 目录结构

- `lossless/` — 二期 canonical fixture 集合 + Core 无损保真测试输入。每个文件被
  `manifest.json` 机器可读地引用，记录 `category`、`source` 与 `sha256` hash。
  涵盖 CommonMark、GFM、CJK、malformed、nested、table、image、diagram、HTML、
  FrontMatter、EOL（LF/CRLF/mixed）、BOM 等场景，用于 Core 解析重建后输出与
  原文件一致（byte-for-byte roundtrip）的确认。
- `size/` — 1/10/50 MiB 大文件（`1mb-filler.md`、`10mb-filler.md`、`50mb-filler.md`），
  用于 benchmark 和大文件降级策略测试。文件直接提交进 git，
  `manifest.json` 记录其 `sha256` 与字节大小。

## 来源语义（`source` 字段）

- `core` — 文件源自 Core 单元测试的 lossless fixture 集合，同时作为二期 canonical 输入。
- `canonical` — 二期新建的 canonical fixture（并入本目录），
  同样被 Core roundtrip 测试覆盖。

## 校验

```bash
scripts/check-fixtures.sh
```

该脚本校验 `manifest.json` 符合 `scripts/schemas/fixture-manifest.schema.json`，
并重算所有文件的 `sha256` 与 manifest 比对。`npm run validate:openspec` 已串联该脚本。
