# Tasks

## 1. 编辑器文档上下文

- [x] 1.1 实现 PM/CM 完整状态、documentState、opaque registry、asset/image draft 上下文的安全 detach/attach 与释放；用三文档双模式编辑、撤销与 opaque 保真测试验证。
- [x] 1.2 建立 dirty-check flush/cancel 及 save/image/source lazy callback 的身份边界；用延迟回调和保存/切换竞争测试验证无跨文档污染，记录上下文 API 约束。

## 2. 标签生命周期与文件安全

- [x] 2.1 实现稳定 id 会话集合、路径去重、10 标签上限、双模式滚动、原子激活与同步投影；测试切换无确认、失败回滚及上限。
- [x] 2.2 接入文件打开、新建、保存/另存、单标签关闭、恢复栈和全窗口逐一确认；测试后台关闭、保存失败/取消、右邻优先、空状态与资源释放。
- [x] 2.3 路径 rename/move/delete 覆盖全部标签，外部事件与激活 stat 检查按文档路由，保留后台冲突并暂停 autosave；测试后台修改/删除、目录匹配与磁盘不被静默覆盖。

## 3. 入口与界面

- [x] 3.1 按原型接入 36px 标签栏、同名路径区分、固定脏标记、横向滚动、plus/close/middle click、aria 和键盘焦点；组件测试验证并保留可运行的视觉检查入口。
- [x] 3.2 接入 Ctrl/Cmd+T/W/Shift+T、Ctrl+Tab/Shift+Tab，设置与确认模态保护；测试快捷键、旧打开/新建/保存入口和标题/大纲/状态栏一致性。
- [x] 3.3 Finder/CLI 批量路径进入单窗口标签，显式新窗口入口保留；补 Rust 路径队列测试并通过 fmt/clippy/test。
- [x] 3.4 更新界面目标形态文档、使用说明与必要既有规范上下文，明确容量/无重启恢复/关闭恢复磁盘版本；核对文档与实际行为一致。

## 4. 集成验证

- [ ] 4.1 运行关键集成回归、npm test、npx tsc --noEmit、npm run build 和 openspec validate document-tabs；修复失败并报告验证结果及视觉验证方法，供独立 Verify Agent 重验。
