# P7:Typora 完全体富块 — 内联图片、GFM 表格编辑、Mermaid/PlantUML 渲染

## 0. 状态

> **BACKLOG:不属于 Issue #254 当前交付范围。** 本文是 P6 之后的后续功能点规划。
> - 来源:2026-08-29 Program Owner 决定,把原 P4B 的 image/GFM table/Mermaid/PlantUML widget(原 tasks 7.5/7.6 的一部分)移出 P5 关键路径,独立为 P7;P4B 只保留轻量控件(task checkbox、code fence controls、FrontMatter)与 raw HTML policy。
> - 前置:P0–P5 全部 Go(Live Preview 为唯一编辑路径);建议 P6 M1/M2(hidden marker 状态机)Go 后启动,使富块 widget 一步接入 hidden 联动。
> - 当前:NOT STARTED。P6 Go 之前不得开展实施。
> - 目标形态:补齐 Typora 完全体差距——表格可视化编辑、图片在文档流内渲染、图表源码渲染预览。

## 1. 目标

把 P3 交付的「exact source fallback」富块升级为 Typora 式渲染编辑:`![alt](src)` 在文档流内显示为图片、GFM 表格渲染为可编辑表格、Mermaid/PlantUML 围栏渲染为图表。

**不改变底座**:Live Preview 仍是单一 CodeMirror `EditorState.doc`,`doc` 永不因投影而重写;字节无损契约(L0/L1)是 P7 的硬性约束;widget DOM 永远不是正文;每个 item 独立 flag、独立验收、独立回滚,全部沿用 P4B 已验收的 widget protocol / owner registry / source fallback 协议。

## 2. 与现有阶段的关系

| 阶段 | 关系 |
| --- | --- |
| P3 | 复用 image paste/drop 资源事务与精确 source range 管线(`imageSourceRange.ts` 已交付);P7 只把展示从源码升级为内联渲染 |
| P4A | **不硬依赖**:Table/Image 的 marker/content ranges 可由 Lezer GFM local 树提供,Mermaid/PlantUML 本质是 fenced code + info string,local ranges 足够;Core IR 若 Go,可增强 stable block identity(表格行/列操作的位置重映射) |
| P4B | 复用 widget protocol、owner registry、source fallback、每项独立 flag 模式;P4B 期间这些富块保持 exact source fallback(P3 形态) |
| P6 | hidden marker 状态机稳定后,富块 widget 的围栏/marker 隐藏联动一步到位;P6 期间富块保持 fallback,不阻塞 P6 各里程碑 |

## 3. 分项设计

### 3.1 内联图片(M1,最先)

- `![alt](src)` 以 replace decoration + image widget 渲染在文档流内;点击/光标进入揭示源码(复用 P6 reveal 模式)以编辑 alt/路径。
- alt/路径编辑走局部 source transaction;资源迁移复用 P3 image pipeline(design 04 §6):resource preflight → 局部 patch → ack → 原子提交,失败补偿不清文档。
- 加载失败、broken URL、超大图、非白名单 URL policy → 精确回退源码;alt 文本的 accessibility name 必测。
- 独立 flag:`livePreview.imageWidget`。

### 3.2 GFM 表格编辑(M2)

- 渲染表格 widget + cell 编辑协议:Arrow/Tab cell 导航、Enter cell 内换行或新行、行/列增删、对齐切换。
- **全部操作生成为局部 source transaction**:只覆盖目标 cell/行/列的 source range;未触及 cell、分隔行、对齐行的 bytes 必须逐字节保留(L1 surviving-span golden 必测)。
- escaped pipe(`\|`)、cell 内嵌 HTML/多行内容先精确回退源码,不做半渲染。
- 独立 flag:`livePreview.tableWidget`。

### 3.3 Mermaid(M3a)/PlantUML(M3b)

- fenced code + info string 识别,渲染为图表 widget。
- 沙箱渲染:禁止任意脚本、外部网络受产品设置/CSP/SSRF 策略约束(design 05 §7);timeout/cancel;渲染失败或超时精确回退源码并提供 Retry。
- PlantUML 明确渲染通道(本地/服务端)与网络策略;无可用通道时保持源码,不降级为不安全渲染。
- 恶意源码 fuzz、恶意 URI、超大 token 为必测项。
- 独立 flag:`livePreview.mermaidWidget`、`livePreview.plantumlWidget`。

## 4. 通用矩阵(P4B 矩阵之上追加富块专项)

每 item 按 P4B §4 通用矩阵全量执行,另加:

- image:必测 alt/path/title、pending resource、broken URL、资源失败补偿、大图缩放;
- table:必测 cell navigation、escaped pipe、alignment、row/column operation、一次操作一次 Undo;
- diagram:必测恶意源码、timeout、network policy、降级提示;
- 视觉:三主题、zoom 200%、high contrast、print/export fallback(export 读取 Core snapshot,不读 widget DOM);
- 性能:Normal/Large/Huge 分级、渲染 debounce、viewport-only、RSS 预算(NFR §6);Huge 档默认源码。

## 5. 关键风险与应对

| 风险 | 应对 |
| --- | --- |
| 表格行/列操作改写未触及 bytes | patch 只覆盖目标 range;L1 surviving-span golden 必测;任何未触及 bytes 改变 = 单项 No-Go |
| 图片资源事务与文档写盘竞争 | 复用 P3 resource preflight/补偿协议(design 04 §2/§6);资源先落地、失败可 GC,文档不引用未落地资源 |
| Mermaid/PlantUML XSS/SSRF/任意脚本 | 沙箱 + URL/network policy + fuzz;失败一律回退源码 |
| 大文档渲染卡顿 | viewport-only + debounce + Huge 默认源码(NFR §6) |
| 与 P6 hidden 状态机冲突 | 复用单 owner registry;P6 状态机 Go 后再接入 hidden 联动;冲突时富块先回退 fallback |
| widget DOM 被误当正文 | 沿用 P4B 协议:widget commit 只能返回 source changes,经 active binding 校验 |

## 6. 里程碑 / 验收 / 回滚

- **里程碑**:M1 内联图片 → M2 GFM 表格编辑 → M3 Mermaid/PlantUML。
- **验收**:每 item 按 §4 矩阵全过 + source before/after byte report(未触及 bytes 不变)+ 独立 Reviewer + 人工 Accept/Reject。
- **Go/No-Go**:任何未触及 bytes 改变、XSS/SSRF、selection trap、资源补偿失败、不可回源码 = 单项 No-Go(不阻塞其他项)。
- **回滚**:关闭单项 flag → 回退 exact source fallback(P3 形态);正文/dirty/Core revision 不变。

## 7. 明确不在 P7 范围

- FrontMatter widget 与 raw HTML policy 仍在 P4B(轻量控件与安全策略,不属富块);
- 公式渲染(KaTeX/MathJax)、表格合并单元格(GFM 不支持)、cell 内嵌 HTML 富编辑——如需另立功能点;
- P6 的 marker 隐藏矩阵本身(P7 只消费其状态机,不重复其验收)。
