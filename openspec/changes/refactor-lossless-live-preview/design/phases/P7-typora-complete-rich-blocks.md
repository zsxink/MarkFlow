# P7：Typora 式富块编辑与支持矩阵收口

## 0. 状态

> **IN SCOPE — PLANNED / NOT STARTED。** P7 是 Issue #254 的必达阶段，不再是 program 外 backlog。
>
> 前置：`P4B-SUBSTRATE-GO`（widget protocol/owner/source fallback）已记录；P6 visibility engine 和基础 cohorts 已 Go；P4A 已冻结 `SPIKE_COMPLETE_NO_CORE_IR`。
>
> 后续：P7 Go 后进入 P5 最终发布与 legacy 清理。

## 1. 产品目标与边界

把仍显示源码的主要富块升级为同一文档流内的渲染与编辑：task checkbox、code fence controls、图片、GFM table、Mermaid/PlantUML、FrontMatter safe projection 和 raw HTML safe fallback。

P7 不再使用“Typora 完全体”表示全功能复制。体验对齐不等于覆盖 Typora 的全部扩展；公式、footnotes、TOC、callouts、自定义 HTML 富编辑等只有在 MarkFlow 支持矩阵明确列为 release scope 时才是必达项，否则必须声明为 source fallback。不得用模糊的“完全体”掩盖实际未支持范围。

## 2. 共用架构

```text
CodeMirror source range
  ├─ read-only projection/widget
  ├─ focus/reveal/edit command
  └─ local TransactionSpec → History → Core patch
```

- widget DOM 永远不是正文；
- 同一 construct identity 的 owner 必须是 `local`、`widget` 或 `source-fallback` 之一；父子 overlap 只允许发生在 parent 明确让出的 child range/editable slot；
- commit 前校验 binding/session/document/revision/source range；
- failure、stale、unsafe、unsupported 一律回最小可信 source range；
- 每项独立 flag、evidence、Reviewer、人工验收和回滚。

Owner 仲裁固定为：最小不可信 `source-fallback` range 压制内部所有投影；list parent 让出 task checkbox marker；paragraph parent 让出 image source range；table widget 拥有结构 shell/delimiter，并只在可信 cell content slot 内允许 P6 inline local owner。Owner handoff 在一个状态更新中完成，不得出现重复 decoration 帧。

## 3. M1：Task/Fence/FrontMatter/Raw HTML 收口

复核 P4B 轻量 widgets 与 P6 hidden 联动：task checkbox 点击/Space 局部切换；code fence controls 不遮挡源码入口；复杂 FrontMatter 回源码；raw HTML 默认不执行，sanitize preview 只读且可 reveal source。

## 4. M2：内联图片

- 文档流内渲染本地/允许的远程图片；
- click 选择，显式动作编辑 alt/path/title、替换、删除、复制、打开位置；
- paste/drop/replace 复用 P3 资源 preflight、binding identity 与补偿协议；
- 只覆盖目标 alt/path/title source range，不能全文重写；
- broken URL、缺失文件、超大图、decode/permission/policy 失败显示错误并可 Retry/reveal；
- alt 是 accessibility name；read-only 不提交；print/export 读取 Core snapshot 与安全 renderer，不读 widget DOM。

## 5. M3：GFM 表格编辑

- 支持 click、Arrow、Tab/Shift-Tab、Enter/Escape、Home/End cell navigation；
- 支持 cell edit、alignment、row/column add/delete/move；一次 UI 意图一次 Undo；
- inline Markdown 复用 P6 visibility engine；
- cell edit 只覆盖 cell content range；结构操作声明所有 affected insertion/replacement ranges；
- surviving cell、padding、delimiter、EOL 与其他 bytes 逐 span 验证 L1；
- escaped pipe、多行 cell、嵌套 HTML、malformed delimiter 或 range 不可信时整个最小 table range 回源码，不做半渲染。

P4A 为 `SPIKE_COMPLETE_NO_CORE_IR` 时，P7 必须证明 Lezer local ranges 足以支撑每项操作；无法证明的结构操作保持 source fallback，不得猜测重写表格。

键盘结果由 [结构编辑与表格键盘 ADR](../../adr/adr-typora-structural-interaction-matrix.md) 唯一规定：cell 边界 Left/Right 前后导航，Up/Down 同列导航，末 cell Tab 或末行 Enter 追加一行，Escape 先退出 cell editor、再次 Escape reveal source。Composition active 期间不跨 cell；非空 selection 的 Enter/Tab 不删除 selection，commit 后按目标键执行 cell 导航。

## 6. M4：Mermaid / PlantUML

- fenced source 与 preview 双态，始终提供 Edit Source、Retry、copy/export；
- render 请求 debounce、cancel、revision identity、timeout、size/token limit 和 viewport lifecycle；
- Mermaid 禁止脚本、外部副作用和不安全 SVG；
- PlantUML 明确本地/用户配置远程通道。远程前提示正文发送第三方，执行 protocol/redirect/DNS/IP/SSRF/CSP/size/timeout/SVG sanitize；
- 离线、未配置或无安全通道时保持源码，不自动使用公共服务；
- export/print 使用安全渲染结果或明确 source fallback。

## 7. 发布支持矩阵

P7 必须生成并由 Program Owner 签署正交的最终矩阵；`projection maturity` 与 `default state` 不得塞入同一枚举：

| 构造 | Release scope | Projection maturity | Normal/Large 默认 | Huge 默认 | 配置条件 | Go 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| heading/paragraph/inline marks/links/quote/lists | `WYSIWYG-required` | `hidden-preview`（P6） | ON / ON | Source | 无 | P6 全矩阵 |
| task checkbox | `WYSIWYG-required` | `interactive-widget` | ON / ON | Source | 无 | patch/keyboard/a11y |
| code fence | `WYSIWYG-required` | `hidden-preview` + source editing；controls 为 widget | ON / ON | Source | 无 | source/IME/fallback |
| image | `WYSIWYG-required` | `interactive-widget` | ON / ON | Source/按需 | URL/resource policy | resource/L1/a11y |
| GFM table | `WYSIWYG-required` | `interactive-widget` | ON / ON | Source | range 必须可信 | ADR matrix/L1 |
| FrontMatter | `policy-required` | safe subset projection；复杂语法 `source-fallback` | ON / ON | Source | safe subset | malformed/fallback |
| raw HTML | `policy-required` | `source-fallback`；可选安全只读 preview | Source / Source | Source | preview opt-in | XSS/CSP |
| Mermaid | `conditional` | 安全 renderer 可用时 `interactive-widget` | 设置启用时 ON | Source | renderer + user setting | sandbox/SVG |
| PlantUML | `conditional` | 安全通道可用时 `interactive-widget` | 设置启用时 ON | Source | local 或用户配置远程 | disclosure/SSRF |

“ON”指默认用户在满足列出的安全/配置条件时无需再打开实验 flag。`WYSIWYG-required` 的 image/table 若实现达到 widget 但默认仍 OFF，P7 MUST NOT Go；`policy-required` 以签署的安全 source fallback 完成不构成降级。

任何新增必达项必须在 P7 Go 前写入 spec、任务和矩阵；不能在 P5 清理时临时降低目标。

## 8. 验收、Go/No-Go 与回滚

每项执行 P4B 通用矩阵和富块专项：source before/after bytes、keyboard、IME、a11y、visual、security fuzz、offline/timeout、async stale、viewport/performance、export/print。

以下任一为单项 No-Go：未触及 bytes 改变、widget DOM 进入正文、selection trap、资源补偿失败、XSS/SSRF/未授权网络、stale 结果跨文档应用、失败后不可回源码。

P7 Go 要求矩阵所有 release-scope 必达项达到目标状态；可选项必须准确声明 fallback。回滚关闭单项 flag，回到同一 source range，不改变 doc、History、dirty、Core revision 或其他 widget。
