# Design

## Context

`scripts/homebrew-publish.sh` 用 bash heredoc 拼 cask Ruby 文件，`on_arm` / `on_intel` 两段各由一个 `if` 块 echo 出 url 行 + `verified:` 参数行 + sha256 行。url 行末尾的逗号存在 solely 为了连接 `verified:` 这个 url 的第二参数。

## Goals / Non-Goals

**Goals:**
- 模板产出的 cask 不再包含 `verified:`，下次发版起 tap 自动同步不再复活该参数。

**Non-Goals:**
- 不修改 tap 仓库中已存在的 cask（下次发版 bump 会整体覆盖为模板产物，自然消失）。
- 不改动 cask 的其余结构（livecheck、zap、双架构段等）。

## Decisions

- **直接删除两处 `verified:` 行，并去掉 url 行末尾逗号**：`url "..."` 单参数调用不需要逗号。备选方案是保留逗号写法，但单参数带尾逗号在 Ruby 中虽合法却易再被「补参数」，干脆删净。
- **同步清理而非条件化**：不引入「是否带 verified」的开关——该参数已废弃且本场景（url 与 homepage 同域 github.com）从不需要，没有保留分支的价值。

## Risks / Trade-offs

- [删除行导致 heredoc 内 shell 语法破坏] → 本改动在 heredoc 内的 `$(if ... echo ...)` 块中，行删除后跑 `bash -n` 语法检查确认。
- [已有 tap cask 仍带 `verified:` 直到下次发版] → 接受；tap 侧已被手动清理过（d9998173），模板修复后不会再写回。
