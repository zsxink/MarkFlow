# license-compliance Specification

## Purpose

让仓库的许可证声明、第三方依赖与随包资源的授权依据、以及发行包内附带的许可证文本保持可审查、可再生、可追溯，避免公开声明与实际分发条件不一致。

## Agent Context
- **源码入口：** `LICENSE`、`THIRD-PARTY-NOTICES.md`、`docs/privacy.md`、`docs/privacy.en.md`、`third-party/`（清单快照、许可证文本、字体与素材授权记录）、`scripts/generate-license-inventory.mjs`、`scripts/check-license-inventory.mjs`、`src-tauri/tauri.conf.json` 的 `bundle.licenseFile` / `bundle.resources`。
- **关联规范：** `font-stack`、`plantuml-render`、`readme-sync`、`dep-audit-ci`、`bundle-budget`。
- **不变量：** 清单必须由锁定文件派生而非手工维护；门禁必须离线可跑；需随包分发的许可证必须有文本文件；修改过的 OFL 字体不得沿用上游保留字体名。
- **验证：** `npm run licenses:generate`（内容变更后）；`npm run licenses:check`；`npx openspec validate license-compliance --strict`；`npm run build` 后检查安装包资源目录含 `LICENSE`、`THIRD-PARTY-NOTICES.md` 与 `third-party/texts/`。

## Requirements

### Requirement: 根目录主许可证文件

仓库根目录 SHALL 包含 `LICENSE` 文件，内容为 MIT 许可证全文，且与 `README.md`、`README.en.md` 的许可证声明一致。

`LICENSE` 的版权行 MUST 写明版权主体与年份，年份 MUST 为项目首次提交年份。

#### Scenario: 根目录存在主许可证
- **WHEN** 检查仓库根目录
- **THEN** 存在 `LICENSE` 文件，首行为 MIT 许可证的版权声明
- **THEN** 文件正文包含 MIT 许可证的标准授权与免责条款全文

#### Scenario: README 声明与 LICENSE 一致
- **WHEN** `README.md` 或 `README.en.md` 声明许可证类型
- **THEN** 声明的许可证类型 SHALL 与 `LICENSE` 的许可证类型相同
- **THEN** README 的许可证段落 SHALL 指向根目录 `LICENSE` 文件

### Requirement: 第三方许可证清单可生成

项目 SHALL 提供一个生成脚本，从锁定文件派生第三方许可证清单，覆盖生产 npm 依赖与 Rust 依赖树。

清单 SHALL 包含两部分：
- 机器可读快照，逐条记录依赖名、版本、许可证标识与来源锁定文件；
- 渲染后的人类可读通知文件 `THIRD-PARTY-NOTICES.md`，按许可证分组列出依赖，并附上需要随包分发的许可证与版权文本。

清单的依赖集合 MUST 由锁定文件推导，不得手工维护依赖名清单。生成过程 MUST NOT 访问网络。

#### Scenario: 从锁定文件派生清单
- **WHEN** 运行清单生成脚本
- **THEN** 输出覆盖 `package-lock.json` 中全部生产依赖条目
- **THEN** 输出覆盖 `src-tauri/Cargo.lock` 依赖树中的全部条目
- **THEN** 每条记录包含依赖名、版本与许可证标识

#### Scenario: 缺少许可证元数据仍被记录
- **WHEN** 某个依赖在锁定文件中没有许可证字段，但其包内包含许可证文件
- **THEN** 清单 SHALL 从包内许可证文件推导许可证标识
- **THEN** 清单不得静默省略该依赖

#### Scenario: 生成过程离线
- **WHEN** 在无网络环境下运行清单生成脚本
- **THEN** 脚本成功完成
- **THEN** 不发起任何网络请求

### Requirement: 第三方许可证清单门禁

项目 SHALL 提供一个离线校验脚本，在 CI 与本地质量门禁中运行，验证清单与锁定文件一致且许可证状态完整。

校验 MUST 在下列任一情况失败并以非零退出码退出：
- 清单未覆盖锁定文件中的某个依赖，或包含锁定文件中不存在的依赖；
- 某依赖的许可证标识不在允许清单内；
- 需要随包分发许可证文本的许可证缺少对应文本文件；
- 提交的清单与重新生成的结果不一致。

失败输出 MUST 指明具体依赖名、版本与失败原因。

#### Scenario: 锁定文件新增依赖未更新清单
- **WHEN** `package-lock.json` 或 `src-tauri/Cargo.lock` 新增了依赖，而清单未重新生成
- **THEN** 校验失败，输出缺失的依赖名与版本

#### Scenario: 出现不在允许清单内的许可证
- **WHEN** 某依赖的许可证标识不在项目允许清单内
- **THEN** 校验失败，输出该依赖名、版本与许可证标识

#### Scenario: 缺失随包许可证文本
- **WHEN** 某依赖的许可证要求随二进制分发附带许可证或版权文本，而对应文本文件缺失
- **THEN** 校验失败，输出该许可证标识与期望的文本文件路径

#### Scenario: 清单与锁定文件一致
- **WHEN** 清单由当前锁定文件生成且所有许可证状态完整
- **THEN** 校验通过并以零退出码退出

### Requirement: 随包字体与素材的授权可追溯

项目 SHALL 为随发行包分发的字体文件与图形素材保留来源记录，逐项写明上游来源、上游版本或发布标识、上游文件校验值、本地文件校验值，以及是否经过修改和修改方式。

字体记录 MUST 包含子集化或格式转换参数，并说明该修改对许可证保留字体名条款的影响。

自有原创素材 MUST 标注为项目原创，并记录其生成脚本或设计源文件路径。

#### Scenario: 字体来源可追溯
- **WHEN** 审查 `src/assets/fonts/` 下任一字体文件的授权依据
- **THEN** 记录中可查到其上游项目、上游版本、上游文件校验值与本地文件校验值
- **THEN** 记录中写明该文件是原样转换还是经过子集化等修改

#### Scenario: 修改过的字体不使用上游保留字体名
- **WHEN** 内置字体经过子集化或其他构成 Modified Version 的修改
- **THEN** 该字体在应用内对外呈现的字体族名 MUST NOT 包含上游声明的保留字体名
- **THEN** 字体记录 SHALL 说明改名依据

#### Scenario: 原创素材标注来源
- **WHEN** 审查应用图标、字标或安装器背景图的授权依据
- **THEN** 记录中标明其为项目原创
- **THEN** 记录中给出对应的设计源文件或生成脚本路径

#### Scenario: 派生素材标注上游许可证
- **WHEN** 随包图形素材派生自第三方图标库
- **THEN** 记录中标明上游项目与许可证
- **THEN** 该许可证文本 SHALL 出现在第三方许可证清单中

### Requirement: 发行包携带许可证文本

发行包 SHALL 通过 `src-tauri/tauri.conf.json` 的 `bundle.licenseFile` 声明主许可证，并通过 `bundle.resources` 携带第三方许可证清单与所需许可证文本，使安装后的用户可获取这些文件。

#### Scenario: 安装包包含主许可证
- **WHEN** 构建任一打包目标
- **THEN** 发行包 SHALL 包含根目录 `LICENSE` 的内容

#### Scenario: 安装包包含第三方通知
- **WHEN** 构建任一打包目标
- **THEN** 发行包 SHALL 包含 `THIRD-PARTY-NOTICES.md` 与许可证文本目录

### Requirement: 隐私与数据流说明

项目 SHALL 提供中英文隐私说明文档，描述本地数据存储位置、联网行为与用户可控的对外数据流。

说明 MUST 覆盖：
- 文档内容、设置与日志的本地存储位置；
- 无自动遥测、无使用统计上报；
- 无自动更新检查；
- PlantUML 图表源码仅在用户自行配置服务器后发往该服务器，服务器由用户选择和控制。

隐私说明 MUST 与产品内现有警告提示保持一致，不得弱化或删除产品内提示。

#### Scenario: 说明本地存储位置
- **WHEN** 用户阅读隐私说明
- **THEN** 文档列出设置文件与日志目录在各平台的位置

#### Scenario: 说明无自动遥测
- **WHEN** 用户阅读隐私说明
- **THEN** 文档明确说明应用不收集使用统计、不上报遥测数据

#### Scenario: 说明 PlantUML 数据流
- **WHEN** 用户阅读隐私说明
- **THEN** 文档说明仅当用户配置 PlantUML 服务器地址后，该图表源码才会发送到该服务器
- **THEN** 文档说明服务器由用户选择和控制，敏感内容应使用自建服务器

#### Scenario: 中英文说明一致
- **WHEN** 对比中文与英文隐私说明
- **THEN** 两者描述的存储位置、联网行为与数据流 SHALL 一致
