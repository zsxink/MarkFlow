# Tasks

## 1. 清理 cask 模板中的废弃 verified 参数

- [x] 1.1 删除 `scripts/homebrew-publish.sh` 中 `on_arm` 段 url 行末尾逗号与 `verified: "github.com/${SOURCE_REPO}/"` 行；`on_intel` 段同样处理。验证：文件中 `grep -n "verified"` 无匹配。
- [x] 1.2 脚本语法与产物形态自检。验证：`bash -n scripts/homebrew-publish.sh` 通过；抽取 heredoc 模板在本地变量代入后生成的 Ruby 文本不含 `verified:`，且 `on_arm`/`on_intel` 的 url 行无尾逗号。

## 2. 门禁与回归确认

- [x] 2.1 运行项目门禁确认无意外波及。验证：`node scripts/check-layering.mjs` 通过；`npm test` 与 `npx tsc --noEmit` 通过（本改动不触 TS 代码，预期不受影响）。
