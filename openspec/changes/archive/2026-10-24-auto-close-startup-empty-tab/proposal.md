# Proposal

## Why

应用启动时会自动创建一个默认的「未命名」空标签页。用户随后打开第一个真实文档（文件树点击或系统文件浏览器双击 md 文件）后，这个空标签页会一直残留，需要手动关闭，打断了「打开即写」的连续体验。

## What Changes

- 启动默认创建的空标签页增加来源标记，与手动「新建标签」创建的标签区分。
- 打开文档成功时（文件树点击与系统文件浏览器/Finder 双击两条入口最终都汇入 `openDocumentTab`），若启动默认空标签页仍为空（从未编辑、非脏），自动关闭它。
- 用户手动创建的空标签页不自动关闭；启动默认空标签页已被编辑（脏）时也不自动关闭；打开失败时不关闭。
- 单元测试覆盖上述分支，并更新受影响的现有断言。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `document-tabs`: 新增「启动默认空标签页自动关闭」要求——启动默认空标签页在首个文档打开成功且自身仍为空时被自动关闭；手动创建的标签与已编辑的启动标签不受影响。

## Impact

- `src/ui/documents/session.ts`：`DocumentSession` 增加启动来源标记；`initDocumentSessions`/`newDocumentTab` 设置标记；`openDocumentTab` 成功后回收空的启动标签。
- `src/ui/documents/__tests__/`：新增/更新会话单测。
- E2E：冷启动 smoke 中「初始未命名标签保留」相关断言需按新行为调整。
- 无 Rust 侧改动，无持久化格式变更。
