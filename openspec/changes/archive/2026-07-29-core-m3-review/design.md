## Context

M3 阶段（Core-backed Source Mode）已基本实现并合入 main。完成度复核（`openspec/prompts/m3-completion-review.md`）发现代码质量和文档方面存在大量技术债务：

- Rust Core 在重构中积累了测试基础设施泄漏、死代码、可见性过宽、expect/unreachable 等历史遗留问题
- Tauri Backend 有死代码模块、Mutex 不安全模式、代码重复
- TypeScript 前端存在错误处理不完善、大文件需拆分、测试覆盖不足
- 文档滞后：stage docs 标为"方案已校准"但与当前实现不一致；openspec/specs 碎片化

本次设计聚焦于"pure refactor"——不改变任何用户可见行为，只做内部清理。

## Goals / Non-Goals

**Goals:**
- Rust Core 代码质量达到可维护标准：无 blanket allow(dead_code)、无不必要的 expect/unreachable、可见性合理封装
- Tauri Backend 无死代码模块、Mutex 锁使用安全模式、消除重复代码
- TypeScript 前端错误处理结构化、大文件拆分为可维护单元
- 文档与当前实现同步，消除碎片化
- 所有变更后，markflow-core 和 src-tauri 的 cargo test + clippy 全部通过

**Non-Goals:**
- 不引入新功能
- 不修改用户可见的 UI 行为
- 不改变文档的数据模型或序列化格式
- 不进行架构级重写（如完全删除 document_service.rs 的业务逻辑替代由本次以外单独处理）

## Decisions

### Decision 1: 测试基础设施门控

OriginalSnapshot 字段私有化、testing 模块条件编译、移除 blanket allow(dead_code) 都是低风险的机械替换，按"先机械后复杂"顺序执行：

1. 先做纯机械替换（条件编译、可见性修改、函数重命名）
2. 再做需要理解的变更（scanner.rs 拆分、session.rs ID 提取）
3. 最后做测试补充和 CI 修改

### Decision 2: scanner.rs 不拆分

FINDING 1.1.4 建议将 scanner.rs 拆分。但评估后发现：
- scanner.rs 的 651 行中，检测辅助函数（heading, fence_start 等）与对应 parser 文件高度耦合，提取后需要跨文件 public API 反而破坏封装
- LineInfo 和 collect_lines 提取到 lines.rs 合理，但会导致 `use crate::document::parse_index::lines::LineInfo` 的额外导入开销
- 当前 scanner.rs 内聚度高，方法间通过 self 状态共享
- **决定**：本次不拆分 scanner.rs，将拆分标记为 P2 待后续处理。聚焦更高优先级的变更

### Decision 3: DocumentService 删除 vs 连接

FINDING 1.2.1 建议二选一。`core_bridge.rs:583-643` 的 `reload_document` 与 document_service.rs 业务逻辑重复但接口不同（一个操作 Tauri Command 参数，一个操作内部类型）。本次选择**删除 document_service.rs**，不强制将 reload_document 改为调用它——后者需要额外重构且不改变行为。

### Decision 4: 5 个导出命令统一保存 P2

FINDING 1.2.7 指出 5 个几乎相同的导出命令。统一为 save_export + kind 枚举需要重构前端调用方（7 个位置），属于中等复杂度。本次标记为 P2 暂不处理，先清理死代码和 Mutex 安全。

### Decision 5: TypeScript 大文件拆分和测试移动标记 P2

exportTheme.ts (624行) 和 fileTree.core.ts (770行) 的拆分需要深入理解业务逻辑，36 个测试文件的移动可能破坏 IDE 配置和 CI 路径。这些作为 P2 标记，本次聚焦于**

实际上，这些 P2 的变更已经在 ISSUE #215 中被列为 P2，按 review 文档的优先级执行 P0 和 P1 项目的清理。

### Decision 6: 文档审查原则

- stage docs：更新为反映当前实现状态的描述，不重写完整文档
- openspec/specs legacy 文档：保留为历史参考，添加明确的时间戳和状态标注
- spec 碎片化：本次仅标注现状，不做合并（需要独立 change 处理）

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| scanner.rs 拆分引入编译错误 | 保持不拆分，控制变更范围 |
| snapshot.rs 私有化字段破坏编译 | 确保同时添加 getter 并更新所有调用点；cargo test + cargo build 验证 |
| sessions.rs ID 提取到 types.rs 后 import 路径变更 | 全局搜索替换，cargo check 确认无遗漏 |
| TypeScript 重构后 tsc 或 test 失败 | 全程 npm test + npm run build 验证 |
| fixtures/m3/ 删除后 benchmark 引用缺失 | 先确认零代码引用（grep 确认），再删除 |
| CI 添加新步骤失败 | 在本地完整运行 CI 命令序列验证 |
