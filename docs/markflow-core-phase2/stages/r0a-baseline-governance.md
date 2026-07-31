# R0A：基线、治理与证据系统

## 目标

把“完成”变成可审计状态，避免 119 项任务在一个分支或自由文本 checklist 中失真。

## 范围

- OpenSpec tasks：`1.1-1.7`、`2.10`。
- 主要区域：`docs/`、`openspec/`、`scripts/`、fixtures、CI workflow。
- 不改产品编辑行为，除非为可观测性增加不含文档内容的日志字段。

## 实现

1. 建立 CommonMark、GFM、CJK、malformed、nested、table、FrontMatter、image、diagram、
   HTML、LF/CRLF/mixed EOL、BOM、1/10/50 MiB canonical fixtures。
2. 建立 machine-readable capability matrix，至少记录 owner、child change、flag、
   implementation、unit、integration、desktop、visual、IME、platform、observation 和 evidence URI。
3. 固定 evidence 目录：`stage/case/platform/revision/timestamp`。
4. 记录当前 binary revision、复现步骤、截图、日志目录和已知错误。
5. 建立 archive honesty check：证据为空、revision 不匹配或 required gate 未执行时失败。
6. 定义每阶段 feature flags、默认值、fallback 和删除时间。
7. 冻结 benchmark、visual、IME、widget P0/P1、observation manifests。

## 交付物

- Canonical fixture manifest。
- Capability/evidence schema 与校验脚本。
- R0 baseline report。
- Feature flag 与 rollback matrix。
- Widget scope 和 release-gate ADR。

## 自动验收

- 每个 umbrella task 有唯一 child owner。
- manifests 可由脚本解析，required evidence 不能靠自由文本伪造。
- baseline fixture hash 和日志位置可重复生成。
- `npm run validate:openspec` 与 archive honesty check 通过。

## 人工验收

执行 `M-R0-01` 至 `M-R0-03`，详见
[验收手册](../03-acceptance-and-manual-test-plan.md)。

## 退出与回滚

- 退出：P0/P1 widget、benchmark、visual、IME 和 observation 定义全部批准。
- 阻塞：任一 required evidence 没有 owner 或可复现环境。
- 回滚：仅撤销治理工具，不删除已采集证据和 fixture。

## 后续

[R0B Parser 与 Bridge Spike](./r0b-parser-bridge-spike.md)

