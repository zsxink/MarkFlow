## ADDED Requirements

### Requirement: DMG 安装窗口的背景图随包分发并被窗口引用

DMG 卷内 SHALL 包含打包所引用的背景图文件，且窗口的 icon view 设置 SHALL 引用该文件；打开安装包时窗口 MUST NOT 呈现为无背景的纯色。

#### Scenario: 背景图存在于卷内
- **WHEN** 挂载构建产物 DMG
- **THEN** 卷内存在背景图文件，且其字节内容与配置的源图一致

#### Scenario: 窗口引用该背景图
- **WHEN** 解析产物内 `.DS_Store` 的 icon view 设置
- **THEN** 背景类型不为「纯色」（`backgroundType` 不为 0）
- **AND** 背景图引用指向卷内上述文件

### Requirement: 图标不自动排列

DMG 窗口的 icon view SHALL 处于「不自动排列」状态，使 Finder 采用记录的图标坐标，而不是按名称、种类或日期重排。

#### Scenario: 排列方式为不自动排列
- **WHEN** 解析产物内 `.DS_Store` 的 icon view 设置
- **THEN** `arrangeBy` 的值为 `none`

#### Scenario: 自动排列被判为外观不合格
- **WHEN** 产物内 `arrangeBy` 为 `name`、`kind`、`date` 等任一自动排列取值
- **THEN** 外观断言失败，并指明图标会被 Finder 重排、背景图箭头将指向空处

### Requirement: 图标尺寸与坐标符合配置

DMG 窗口内 `.app` 与 `Applications` 两处图标 SHALL 采用配置的坐标与尺寸；坐标与尺寸的期望值 SHALL 来源于 `tauri.conf.json` 的 `bundle.macOS.dmg`，断言逻辑 MUST NOT 另行硬编码这些数值。

#### Scenario: 两处图标坐标等于配置值
- **WHEN** 解析产物内 `.DS_Store` 中应用图标与 Applications 链接的图标位置记录
- **THEN** 二者的坐标分别等于配置的 `appPosition` 与 `applicationFolderPosition`

#### Scenario: 图标尺寸等于设计目标值
- **WHEN** 解析产物内 `.DS_Store` 的 icon view 设置
- **THEN** `iconSize` 等于本次设计确定的图标尺寸目标值

#### Scenario: 配置与产物不一致时断言失败
- **WHEN** 修改 `tauri.conf.json` 中的坐标配置但未按新配置重新构建产物
- **THEN** 外观断言失败，并报告期望值与实测值的差异

### Requirement: 窗口尺寸符合配置

DMG 窗口 SHALL 采用配置的窗口尺寸，使背景图构图与可视区域一致。

#### Scenario: 窗口边界等于配置尺寸
- **WHEN** 解析产物内 `.DS_Store` 的窗口边界记录
- **THEN** 窗口宽高等于配置的 `windowSize`

### Requirement: 外观契约在产物层面可自动验证

仓库 SHALL 提供一个只读的验证脚本，对 DMG 产物断言上述外观契约。脚本 SHALL 在全部断言通过时以 0 退出；任一断言失败时 SHALL 以非零退出并打印可定位的失败原因；脚本 MUST NOT 修改被检查的产物。

#### Scenario: 合格产物通过断言
- **WHEN** 对归一化后的产物运行验证脚本
- **THEN** 脚本以 0 退出并打印通过信息

#### Scenario: 不合格产物被拦截
- **WHEN** 对未归一化的产物（`arrangeBy` 为自动排列、图标尺寸为系统默认值）运行验证脚本
- **THEN** 脚本以非零退出，并逐条列出未满足的断言

#### Scenario: 验证过程不修改产物
- **WHEN** 验证脚本运行完毕
- **THEN** 产物以只读方式挂载，DMG 文件字节未发生变化

### Requirement: 外观归一化不依赖 Finder

外观的最终确定 SHALL 通过直接改写产物内 `.DS_Store` 完成，MUST NOT 依赖 Finder 自动化（AppleScript）在当前环境是否可用。

#### Scenario: 无图形会话环境下外观仍确定
- **WHEN** 在没有可用 Finder 自动化会话的环境中归一化产物
- **THEN** 归一化后产物的 `arrangeBy`、`iconSize` 与两处图标坐标仍等于配置值

#### Scenario: 归一化是幂等的
- **WHEN** 对同一产物重复执行归一化
- **THEN** 结果与执行一次一致，且验证脚本仍然通过

#### Scenario: 无法构造外观设置时明确失败
- **WHEN** 产物内不存在 `.DS_Store` 且预置构造也失败
- **THEN** 归一化以非零退出并报告失败，MUST NOT 产出一个外观未达标但被标记为成功的产物

### Requirement: 打包与验证路径不依赖图像处理库

背景图的生成 SHALL 与打包、验证路径分离：打包直接使用仓库内提交的背景图文件，验证脚本只读取该文件，二者 MUST NOT 在运行时依赖图像处理库。

#### Scenario: 打包不依赖图像库
- **WHEN** 在未安装图像处理依赖的环境中构建并验证 DMG
- **THEN** 构建与验证均成功完成

#### Scenario: 背景源可重新导出为提交产物
- **WHEN** 开发者执行背景图生成命令
- **THEN** 由仓库内的设计源生成背景图文件，且生成的尺寸与配置的窗口尺寸一致
