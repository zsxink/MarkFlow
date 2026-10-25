# image-preview-tabs Specification

## Purpose
定义图片文件（svg/jpg/jpeg/png/gif/webp/bmp）在标签页中的预览打开分流、渲染缩放与 asset 协议资源授权。

## Agent Context
- **源码入口：** `src/ui/documents/image-preview.ts`、`src/ui/documents/session.ts`、`src/ui/sidebar/fileops.ts`、`src/utils/openable-files.ts`、`src-tauri/src/commands/images/commands.rs`。
- **关联规范：** `document-tabs`（标签会话语义）、`file-tree-architecture`（支持格式过滤共用同一格式集）、`image-streaming`（asset 协议授权语义）。
- **不变量：** 打开分流唯一入口在 `openFileInEditor`；图片字节 MUST NOT 以文本模式读取；预览 src 一律经 `convertFileSrc`（asset 协议）。
- **验证：** `npm test -- src/utils/__tests__/openable-files.test.ts src/ui/documents/__tests__/session.test.ts`；`cargo test --manifest-path src-tauri/Cargo.toml`；`npx openspec validate image-preview-tabs --strict`。

## Requirements

### Requirement: 图片文件预览打开分流

文件打开入口（文件树点击、最近文件、系统文件浏览器多开）SHALL 按扩展名统一分流：`.md` 文件走既有 Markdown 编辑器链路；图片扩展名（`svg`/`jpg`/`jpeg`/`png`/`gif`/`webp`/`bmp`，大小写不敏感）SHALL 在标签页中以预览模式打开，MUST NOT 以文本/源码模式读取其字节；其余扩展名 MUST NOT 打开任何编辑器或预览，SHALL 以 toast 明确提示「不支持该格式」且不崩溃。扩展名判定 MUST 以文件名小写后缀为准（无扩展名视为不支持）。

#### Scenario: 文件树点击图片打开预览
- **WHEN** 用户在文件浏览器中单击/双击 `photo.PNG`、`icon.svg` 等图片文件
- **THEN** 系统 SHALL 新建（或激活已存在的同路径）图片预览标签页并渲染图片，不读取文件文本内容

#### Scenario: 不支持格式点击提示
- **WHEN** 用户点击 `data.csv`、`app.exe`、无扩展名文件等不支持格式
- **THEN** 系统 SHALL 显示「不支持该格式」类 toast 提示，不打开标签页、不抛错、不崩溃

#### Scenario: Markdown 打开链路不受影响
- **WHEN** 用户打开 `.md` 文件
- **THEN** 系统 SHALL 走既有编辑器打开链路（tier 判定、只读降级、最近文件记录），行为与本变更前一致

#### Scenario: 分流入口全覆盖
- **WHEN** 用户从最近文件菜单、系统文件浏览器（多文件打开）等任一入口打开图片文件
- **THEN** 分流结果与文件树点击一致（同一打开入口函数）

### Requirement: 预览渲染与缩放

图片预览标签页 SHALL 通过 asset 协议（`convertFileSrc`）渲染本地图片。预览工具栏 SHALL 提供四个图标控制——适应窗口、1:1、放大、缩小（均带 tooltip 与可访问名称），以及当前缩放百分比读数。预览默认 SHALL 为「适应窗口」模式：图片等比缩放完整可见、水平垂直居中，随窗口缩放自适应；「1:1」SHALL 以精确 100% 像素显示；「放大/缩小」SHALL 以固定步进（×1.25）调整缩放并夹紧在合理范围（10%–800%），从「适应窗口」起步时以当前适配比例为基数；当前所处模式（适应窗口 / 1:1）SHALL 在对应按钮上呈现高亮状态。任意缩放模式下图片 SHALL 水平垂直居中，超出可视区域时容器 SHALL 可滚动，并 SHALL 支持鼠标按住拖动平移（抓取光标反馈，不影响普通滚动与点击）。缩放状态在切换到不同图片时 SHALL 重置为「适应窗口」。预览加载失败（文件被删除、损坏）SHALL 显示占位提示而非空白/崩溃，且加载成功时 MUST NOT 显示失败占位。

#### Scenario: 自适应窗口缩放
- **WHEN** 图片预览标签处于默认「适应窗口」模式且用户调整窗口大小
- **THEN** 图片 SHALL 始终等比缩放完整可见并水平垂直居中，不裁切、不溢出

#### Scenario: 切换原始尺寸查看
- **WHEN** 用户点击「1:1」图标按钮且图片大于可视区域
- **THEN** 图片 SHALL 按精确 100% 像素显示并居中，容器出现滚动条可查看，1:1 按钮呈高亮态；点击「适应窗口」图标按钮后恢复等比完整显示并高亮

#### Scenario: 放大与缩小步进缩放
- **WHEN** 用户在「适应窗口」模式下点击「放大」（设当前适配比例为 68%）
- **THEN** 缩放变为 85%（68% × 1.25 步进），百分比读数同步更新，「适应窗口」高亮消失
- **WHEN** 用户连续点击「缩小」使缩放到达或越过 10% 下限（或 800% 上限）
- **THEN** 缩放被夹紧在该边界，不再继续变化，百分比读数反映夹紧值

#### Scenario: 拖拽平移超出视口的图片
- **WHEN** 图片以 1:1 或放大显示且大于视口
- **THEN** 用户按住鼠标拖动 SHALL 平移图片（光标 grab/grabbing），松开后停止；普通滚动与单击行为不受影响
- **WHEN** 图片完整可见（未溢出）
- **THEN** 拖动不产生平移，光标保持默认

#### Scenario: 任意缩放模式居中
- **WHEN** 图片在任何缩放比例下小于视口
- **THEN** 图片 SHALL 水平垂直居中显示，不出现顶格或偏挂

#### Scenario: 成功加载不显示失败占位
- **WHEN** 图片加载成功显示
- **THEN** 界面 MUST NOT 出现「图片加载失败」占位；仅当图片真实加载失败（删除/损坏/授权失败）时占位才显示

#### Scenario: 预览加载失败降级
- **WHEN** 预览标签打开后图片文件被外部删除或内容损坏导致加载失败
- **THEN** 预览区 SHALL 显示明确占位提示（如「图片加载失败」），应用不崩溃

### Requirement: 预览资源授权

图片预览 SHALL 在渲染前确保图片所在目录已被 asset 协议授权：`$HOME` 内路径由既有静态 scope 覆盖；其外的路径 SHALL 通过后端命令对图片父目录执行动态目录授权（复用 `allow_asset_directory` 语义）。授权失败 SHALL 降级为预览加载失败占位提示，MUST NOT 阻塞其他功能或崩溃。

#### Scenario: 工作区在 HOME 外的图片预览
- **WHEN** 打开的图片位于 `$HOME` 之外的工作区目录
- **THEN** 系统 SHALL 先对图片父目录完成 asset 协议授权再渲染，图片正常显示

#### Scenario: 授权失败不崩溃
- **WHEN** 动态授权命令失败（如文件系统权限拒绝）
- **THEN** 预览区显示加载失败占位提示，应用其余功能不受影响
