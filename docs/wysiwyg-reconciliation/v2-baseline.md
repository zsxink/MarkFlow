# WYSIWYG reconciliation：v2 baseline

这是方案 B 降风险阶段的只读基线。固定语料位于
`src/lib/wysiwyg-roundtrip.fixtures.ts`，清单和重复性测试位于
`src/lib/wysiwyg-roundtrip-baseline.test.ts`。

## 运行

```bash
npx vitest run src/lib/wysiwyg-roundtrip-baseline.test.ts
node scripts/wysiwyg-roundtrip-benchmark.mjs 30
```

benchmark 输出 JSON，默认不包含时间戳，适合在同一机器上重复比较。它测量当前
`tiptap-markdown` 使用的 MarkdownIt 解析/渲染/再次解析路径，不导入或模拟 v3
adapter，因此不会伪造 v3 结果。`heapDeltaBytes` 是单次进程内的粗粒度指标，不能
替代 profiling 工具。

## 当前 v2 记录规则

- 每类语法至少有一个 normal 和一个 edge fixture；invalid 样例记录解析器的恢复行为，
  不把恢复行为当作 v3 兼容承诺。
- 基线测试保存 token 结构签名和 MarkdownIt 渲染结果的可重复性；它不改变磁盘文件，
  也不把 HTML 渲染结果当作新引擎的 Markdown 序列化结果。
- `knownV2Differences` 只记录已观察或代码中明确的 v2 规范化，例如列表缩进、表格
  对齐、代码块尾随换行、图片尾换行元数据和图表 node-view 预览状态。
- 后续 v3 对比必须逐条提供命名 canonicalization 断言；本基线不预先批准任何 v3
  差异，也不填写 v3 expected output。

## 通过标准

阶段一基线设施通过的最低条件是：测试中所有类别清单完整、fixture id 唯一、每个
fixture 有非空正文和显式 v2 差异字段，并且同一进程连续运行得到相同 token 结构签名。
benchmark 只作为性能比较起点；性能门禁应在 v3 实现完成后以同样的 rounds 和文档
大小分级重新运行。
