# License / 维护 / 供应链记录 — run 20260829-035314-p4a-f189b0c

采集时间：2026-08-29（`npm view` 与 crates.io API 当日实测；网络可达）。
本文件为原始输出记录；结论与对比见 `spike/parser-spike/REPORT.md` §6。

## 1. npm 候选（产品现有依赖）

### @lezer/markdown

```
$ npm view @lezer/markdown license version time.modified maintainers repository.url
license = 'MIT'
version = '1.7.2'
time.modified = '2026-07-15T09:08:03.626Z'
maintainers = 'marijn <marijn@haverbeke.berlin>'
repository.url = 'git+https://code.haverbeke.berlin/lezer/markdown.git'
```

最近发布（`npm view @lezer/markdown time --json` 解析，UTC 日期）：

| 版本 | 发布日期 |
| --- | --- |
| 1.6.3 | 2026-01-06 |
| 1.6.4 | 2026-05-28 |
| 1.7.0 | 2026-07-08 |
| 1.7.1 | 2026-07-09 |
| 1.7.2 | 2026-07-15 |

产品内实装版本：1.7.0（node_modules 实测，`report-ts.json` candidates[0].packages）。

### @codemirror/lang-markdown

```
$ npm view @codemirror/lang-markdown license version time.modified maintainers repository.url
license = 'MIT'
version = '6.5.2'
time.modified = '2026-08-04T20:44:39.518Z'
maintainers = 'marijn <marijn@haverbeke.berlin>'
repository.url = 'git+https://code.haverbeke.berlin/codemirror/lang-markdown.git'
```

最近发布：

| 版本 | 发布日期 |
| --- | --- |
| 6.3.4 | 2025-08-01 |
| 6.4.0 | 2025-10-02 |
| 6.5.0 | 2025-10-23 |
| 6.5.1 | 2026-07-15 |
| 6.5.2 | 2026-08-04 |

产品内实装版本：6.5.0。

## 2. Rust 候选（crates.io API，GET /api/v1/crates/<name> 与 /versions）

```
$ curl -s https://crates.io/api/v1/crates/markdown
markdown         max=1.0.0    updated=2025-04-23 downloads=  9400746 repo=https://github.com/wooorm/markdown-rs   license=MIT
$ curl -s https://crates.io/api/v1/crates/pulldown-cmark
pulldown-cmark   max=0.13.4   updated=2026-05-20 downloads=142120888 repo=https://github.com/raphlinus/pulldown-cmark license=MIT
$ curl -s https://crates.io/api/v1/crates/comrak
comrak           max=0.54.0   updated=2026-07-12 downloads= 7222326 repo=https://github.com/kivikakk/comrak    license=BSD-2-Clause
```

最近 3 个版本（/versions 端点）：

| crate | 版本@日期 |
| --- | --- |
| markdown | 1.0.0@2025-04-23 · 1.0.0-alpha.24@2025-04-23 · 1.0.0-alpha.23@2025-02-28 |
| pulldown-cmark | 0.13.4@2026-05-20 · 0.13.3@2026-03-22 · 0.13.2@2026-03-21 |
| comrak | 0.54.0@2026-07-12 · 0.53.0@2026-07-02 · 0.52.0@2026-04-04 |

## 3. 必选依赖面（供应链；源码包 Cargo.toml 实测）

| crate | 必选（非 optional）依赖 |
| --- | --- |
| markdown 1.0.0 | 近零（serde/log/unicode-id 均为 optional feature） |
| pulldown-cmark 0.13.4 | bitflags 2 · memchr 2.5 · pulldown-cmark-escape 0.11 · unicase（getopts/serde optional） |
| comrak 0.54.0 | bon 3 · caseless 0.2 · emojis 0.8 · finl_unicode 1.4 ·（另有 fmt2io 等若干，依赖面为三者中最宽） |

## 4. 供应链评估摘要

- Lezer/lang-markdown：**产品已依赖**，本 spike 零新增依赖、零新增风险；单一维护者（CodeMirror 作者），CodeMirror 为 CM6 生态基座，事实上不可替代。
- markdown-rs：新依赖引入成本最低（近零必选依赖），但见 REPORT.md §4 —— 10MB 解析 20–58s，性能不可用。
- pulldown-cmark：依赖面小、社区下载量最大（142M）、维护活跃；性能最佳；但 0.13 无定界符 span（REPORT.md §3.2）。
- comrak：BSD-2-Clause 兼容 MIT 产品无障碍；依赖面最宽；性能第二；marker 支持同样缺失（仅 checkbox symbol span）。
