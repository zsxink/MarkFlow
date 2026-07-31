# R5C：Legacy Cleanup、最终验收与 Archive

## 目标

在产品证据完整后删除第二文档真相和 legacy 路径，同步 specs 并完成最终归档。

## 范围

- OpenSpec tasks：`12.1-12.10`。
- 主要区域：legacy editor shell/dependencies/CSS、audits、docs、OpenSpec sync/archive。

## 实现

1. 核对每个 P0/P1 capability 的 automated、GUI、visual、IME、platform、observation evidence。
2. 派独立 agent 复核最终 diff、测试和证据真实性。
3. 删除 hidden ProseMirror shell 和 legacy command fallback。
4. 删除 Tiptap/ProseMirror dependencies、extensions、plugins、state、helpers 和无用 CSS。
5. export 若使用 `.ProseMirror` namespace，先迁移到中性 export root。
6. 运行 M8C 与 phase-2 removal audit，阻止第二 document truth 回归。
7. 更新用户/开发文档、架构、capability matrix、troubleshooting、budgets、release notes。
8. 运行全量 frontend、Rust/Tauri、Core、OpenSpec、bundle、E2E、visual gates。
9. delta specs 先 sync，再 archive，再运行 archive-sync checks。

## 验收

- legacy 删除后 full gate 仍通过。
- 无 deferred、blocked、unverified required task。
- rollback artifact 可用。
- specs 已同步，archive 与实现同 PR。
- 人工执行 `M-R5-06`，然后执行验收手册最终接受条件。

## 回滚

使用已验证的上一 release artifact；不得重新引入 serializer save、DOM truth 或 hidden editor。

## 前置

[R5B Current-build 稳定观察](./r5b-stability-observation.md)

