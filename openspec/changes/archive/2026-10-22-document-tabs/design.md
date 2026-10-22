# Design

## Context

现有 Tiptap 实例、CM 源码 facade、editor.state、opaque registry、图片草稿以及保存与 dirty-check 回调均是窗口单例。仅缓存 Markdown 不能保留撤销历史，直接保留多个实例则使隐藏编辑器监听和昂贵节点视图持续运行。已合并 #346 的原型是本次视觉依据。

## Goals / Non-Goals

**Goals:** 活动文档始终只有一个真实编辑面；文档身份、磁盘基线和异步结果不能跨标签串扰；完整保留编辑历史。

**Non-Goals:** LRU 驱逐、标签拖拽、跨重启恢复、跨窗口共享和分屏。首版通过确定的 10 标签上限限制会话数量，不自动回收用户标签。

## Decisions

1. **单编辑器 + 完整内存状态快照。** 引入文档会话协调器，按稳定 tab id 保存 PM EditorState（包括 history 插件）、CM EditorState、documentState、opaque session/registry、asset 映射、图片草稿、模式与每种模式滚动。切换使用 editor.view.updateState 等无解析恢复，不用 setMarkdown 恢复旧标签。新的磁盘加载仍走原准入与分级流程。inactive 文档不保留 EditorView/NodeView，只有状态。相较每标签隐藏实例，此方案保留历史又避免 N 份渲染成本。
2. **显式 detach/attach 文档资源。** opaque detach/attach 不得 clear 旧 registry，关闭才销毁。CM facade 必须取消过期 lazy-load 并保存完整 state，回调绑定 owner；图片队列、draft、save barrier 不可只复制一个引用。路径唯一事实来源为 store，移除树 DOM 优先读取。state 发布须在完整恢复后完成，tree/outline/statusbar/toolbar/window title 同步刷新。
3. **所有改变文档身份的操作串行化。** 打开、激活、关闭、恢复、外部 reload 与窗口关闭共用协调边界；已开始的 save/image 工作在切换前等待完成，或者持有显式 owner token 后仅回写 owner。不让 autosave 和协调器互相等待导致死锁；自动保存只处理当前活动标签，后台脏内容保留，窗口关闭逐个保存。关闭/切换前 flush 文档 dirty-check（原定时 400ms），取消旧 dirty timer 后再离开。异步图片气泡/粘贴回调必须校验 owner 或被边界等待。NodeView 里的公式/图表临时编辑 UI 必须在离开前提交或安全收起，避免位置缓存跨标签；已进入文档模型的编辑必须保留。
4. **标签管理。** 稳定 id 区分多个 untitled 文档；规范化路径去重。同路径重新打开激活现有标签，失败或取消的打开不得破坏原会话。上限 10，超限提示。最近关闭栈最多 10 个路径，不保存大内容快照；恢复成功后才 pop，untitled 丢弃不可恢复。关闭当前选右后左，关闭后台标签保持当前激活。窗口关闭逐一确认且任何失败或取消停止；严格比较保存结果 `=== 'saved'`，不能按字符串 truthiness 判成功。
5. **外部变化。** watcher 事件按路径/目录前缀标记所有标签，后台不弹窗或加载，激活时先恢复内存再进行明确冲突/删除处理。独立文件可能不在 workspace watcher 中，激活时 stat 基线；修改失败也保守冲突。脏冲突保留内存并暂停自动保存，删除不得静默重建。路径重命名/移动同步所有会话和图片路径上下文；应用内删除须先确认所有受影响脏文档。
6. **原型视觉与快捷键。** 标签栏只占 editor 列，sidebar 跨 tabs/editor 两行。36px 高，表面色 active + 顶部 2px accent，固定圆点槽、最大 220px 单行截断、3px 横向滚动条、尾部固定加号。采用 role=tablist/tab、aria-selected、可辨识 close label 和 focus-visible。同名显示父路径并 tooltip 完整路径。空状态不可编辑且统计归零；新建后正常编辑。Ctrl/Cmd+T/W/Shift+T 和 Ctrl+Tab/Shift+Tab；设置/对话框打开时抑制。保留 Ctrl/Cmd+N 的工作区文件创建语义。
7. **Finder 与显式窗口。** Finder/CLI 批量路径队列交给单一目标窗口依次开标签；启动期间的队列和已就绪时的事件均不能丢文件。显式 open_file_in_new_window 保留现有独立窗口语义和窗口隔离关闭权限。Rust 修改运行 fmt/clippy/test。
8. **不跨启动持久化。** 继续恢复已有 workspace 设置；不保存标签内容与脏草稿到设置，避免隐式恢复敏感文本与崩溃恢复语义膨胀。文档明确这一边界。

## Risks / Trade-offs

- [闭包和延迟回调不在 EditorState 内] → 切换前 flush/cancel 并提供 owner 校验，测试 delayed source load、image/save 与切换竞争。
- [保存时重入/死锁] → 单一串行入口，内部 helper 不递归排队；autosave skip busy，交互动作等待，失败不破坏队列。
- [10 个大文档仍有内存成本] → 不保留后台渲染实例，严格数量上限，关闭释放 snapshots/registries，复用已有分级确认；不承诺硬内存字节上限。
- [旧单文档测试依赖替换语义] → 更新到新行为，保留原保存冲突/保真与文件树回归，不通过删除核心断言掩盖失败。

## Migration Plan

无需设置格式迁移。先实现 editor 上下文 API 和会话协调，再接入打开/关闭/外部事件、UI 与 Rust 输入路径。补关键场景测试与渲染检查；同步 main specs 后由独立 Agent 全量走查与验证，归档后再次独立验证，最后 PR squash merge。回退通过 revert 单一 PR 完成。
