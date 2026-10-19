# Spec Delta

## ADDED Requirements

### Requirement: DMG 外观事实在隔离状态下采集

DMG 外观断言所依赖的外观事实（`icvp` 视图设置、bwsp 窗口边界、Iloc 图标坐标、卷内背景文件）SHALL 在隔离状态下采集：采集前 SHALL 卸载目标 DMG 自身的既有挂载与本仓库脚本残留的挂载点（挂载点名含 `markflow-dmg-`），对非目标的其他挂载卷 MUST NOT 做卸载等破坏性操作、SHALL 仅列出清单提示；采集过程 SHALL 对目标卷执行挂载与立即卸载，且采集过程 MUST NOT 依赖本机其他 DMG 窗口的 Finder 状态。这样可避免 macOS 把上一个 DMG 窗口的视图设置套用到下一个 DMG 窗口而造成的断言读数不稳定，也不干扰用户对其他卷的手动操作。

#### Scenario: 目标卷既有挂载被清场后重挂
- **WHEN** 目标 DMG 此前已有挂载（如中断的上一次运行残留）
- **THEN** 断言脚本先卸载该挂载再重新只读挂载目标卷，不出现 attach 失败

#### Scenario: 其他项目的挂载卷不受影响
- **WHEN** 本机已挂载一个非目标 DMG 卷，且对目标 DMG 运行断言脚本
- **THEN** 断言脚本列出该卷的提示清单但不卸载它，采集只读目标卷，结果与干净环境下一致

#### Scenario: 采集过程结束卷已卸载
- **WHEN** 断言脚本运行完毕
- **THEN** 没有目标卷残留在挂载点

### Requirement: 一轮化 DMG 外观回归验证入口

仓库 SHALL 提供一个一轮化的回归脚本：对给定 DMG 产物一次完成「归一化（style）→ 契约断言（verify）→ 存档证据（外观事实 JSON + 打开挂载卷的 Finder 截图）」，并在证据落盘后对证据做最小一致性断言。该脚本用于在发布前一轮确认产物外观，防止「修复晚于发布」类偏差。

#### Scenario: 一轮验证完成并产出证据
- **WHEN** 对合格产物运行回归脚本
- **THEN** 契约断言通过，`evidence/` 目录新增该产物的外观事实 JSON 与 Finder 截图，脚本以 0 退出

#### Scenario: 不合格产物被拦截且不产证据
- **WHEN** 对外观契约未满足的产物运行回归脚本
- **THEN** 脚本以非零退出并指明失败断言，MUST NOT 输出错把不合格产物标记为合格的证据

### Requirement: 发布前的产物外观断言使用隔离采集

发布流水线对 DMG 产物的外观断言 SHALL 使用「隔离采集」入口，而非 in-process 采集；断言失败的判定逻辑与期望值来源（`tauri.conf.json` 的 `bundle.macOS.dmg` 配置 + `dmg-appearance.json` 图标/文字尺寸）保持不变。

#### Scenario: CI 断言读取隔离采集的事实
- **WHEN** 发布流水线在 macOS runner 上对构建产物执行外观断言
- **THEN** 断言所用事实由隔离采集入口产出，而非由断言脚本直接挂载采集
