# Proposal

## Why

Homebrew 已废弃 cask url 的 `verified:` 参数。tap 仓库中该参数曾被手动移除（tap 提交 d9998173），但下一次发版的自动 bump（tap 提交 894303ec）又将其写回——根因是本仓库 `scripts/homebrew-publish.sh` 的 cask 模板仍在输出它，只修 tap 治标不治本（Issue #390）。

## What Changes

- 从 `scripts/homebrew-publish.sh` cask 模板的 `on_arm` / `on_intel` 两段 url 行中删除 `verified:` 参数（同时去掉 url 行末尾为连接该参数而存在的逗号）。
- cask url 与 homepage 同在 github.com 域名下，Homebrew 本就无需 `verified` 声明；删除后每次发版同步生成的 cask 不再复活该废弃参数。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `release-build-matrix`: cask 生成契约补充「url 不得携带已废弃的 `verified:` 参数」的约束，明确生成产物须可通过 `brew audit`。

## Impact

- `scripts/homebrew-publish.sh`：heredoc cask 模板中两处 url 行。
- 下一次发版起，同步到 `zsxink/homebrew-tap` 的 `Casks/m/markflow.rb` 不再包含 `verified:`。
- 不影响 DMG 下载、sha256 计算、双架构 `on_arm`/`on_intel` 结构及发版流程其余步骤。
