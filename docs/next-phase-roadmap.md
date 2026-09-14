# MarkFlow 下一阶段路线图方案

> 2026-08-30 讨论定稿草案。五方向各自方案，实现顺序待 review 后再定。

---

## 0. 前提与背景

### 放弃大重构方案
现有 issue **#254**（CodeMirror Live Preview 无损编辑链路）与 **#255**（lossless byte contract），以及 markflow-core 分层（M1–M8）大重构方案，**已全部关闭并放弃**。GitHub 当前 0 个 open issue、0 个 open PR（2026-08-30 核实）。下阶段不再以任何重构线为主线条目。

### 对标：SuperMarkdown 参考仓库
`kk2679842795/SuperMarkdown`，Electron + React + ProseMirror，仅 6 天历史（v0.2.2，4 stars，1 个 issue）。
- 已有：WYSIWYG（ProseMirror）、KaTeX、Mermaid、代码高亮、沉浸写作三模式、图片自动存储 `assets/`、HTML/PDF 导出
- 同样**没有**：图床、自定义主题、插件系统、Word/LaTeX 导出
- 唯一用户诉求：左右分屏（源码/预览）

**结论：五方向的增强/主题/图床全是差异化空间，两者没有正面冲突。**

### MarkFlow 当前状态（2026-08-30）
- 版本 0.0.6，64 个已归档 change
- WYSIWYG（Tiptap/ProseMirror）+ CodeMirror 源码双模式已全
- Mermaid/PlantUML 惰性渲染管道成熟
- 图片引擎：本地优先，非常完善（粘贴/存储/迁移/流式），**图床上传=零**
- 主题：三套内建（light/dark/sepia）+ CSS 变量 token system（`variables.css`，~13 色 + 3 字体 token），组件无硬编码颜色
- 0 个 open bug，CI + 31 个单测 + e2e smoke/regression

---

## 1. 增强（主攻招牌）

### 1.1 KaTeX 数学公式

**目标：** 行内 `$..$` 与块级 `$$..$$` 实时渲染，支持公式写入场景。

**方案：** 复用现有 Mermaid/PlantUML 的惰性渲染架构（零侵入 Tiptap 内核）。

**技术路径：**
- 解析层：markdown-it 需配 `markdown-it-texmath`（或等效扩展），在解析时识别数学公式语法
- 渲染层：惰性渲染管道 → 静态图块展示（带双击回源码编辑的交互，复用 Mermaid/PlantUML 已有模式）
- 前端依赖：`katex` npm 包（SSR 渲染到 HTML，无运行时客户端渲染）
- 核心优势：不修改 Tiptap 内核，不影响 WYSIWYG 主链路

**已知约束：** KaTeX 渲染在 `markdown-it` 层完成（非 WYSIWYG 实时），体验为"静态块展示+双击编辑"，非 Typora 的"输入即渲染"。若后续要升级为 WYSIWYG 内实时渲染，需另开 Tiptap node（成本高，不建议现阶段做）。

---

### 1.2 表格增强

**目标：** GFM 表格 WYSIWYG 内实时编辑——点选/Tab 导航/增删行列/对齐，对标 Typora 表格体验。

**状态：✅ 已交付（issue #262，`feat/issue-262-table-wysiwyg-interaction`）**

已实现能力：
- **输入即表格**：`MarkdownSafeTable` 自定义 InputRule（表头+分隔行+数据行后回车自动成表，光标落于首个数据单元格），非法/列数不一致输入保持原文不转换
- **单元格右键菜单**：`tableContextMenu.ts` 复用 `showContextMenuStatic`，提供上/下行、左/右列、删行/删列/删表 + 左/中/右对齐 + 表头行切换；作用域解析到触发单元格所在行列
- **边界插入句柄**：`TableHandleView` 逐边界 `+` 句柄（每数据行左侧、每列分界线顶端 W+1 条），点击插行/列，悬停显形、移出隐藏、无 DOM 残留；句柄上右键同样弹出表格菜单，作用域解析到最近行列
- **对齐持久化**：`setCellAttribute('align')` → 序列化为 `:--- / :---: / ---:` 对齐标记行，重解析保留
- **写入安全**：所有交互编辑走既有 admission/eligibility/reconcile 安全管道，往返保真回归覆盖（`wysiwyg-markdown-roundtrip.section3` 4.1/4.2 场景）

**已知约束（后续变更边界）：**
- 合并/拆分单元格、列拖拽重排、嵌套表格、HTML 表格导入不在已交付范围
- 源码模式（CodeMirror）表格无交互
- 历史分支 `m7a-gfm-table` 已被本实现吸收（非复用基础）

---

### 1.3 frontmatter 编辑

**目标：** YAML frontmatter 变成可感知的一等公民——语法高亮 + 可视化编辑面板。

**方案：**
- 编辑器顶部：frontmatter 区域与正文视觉分离（带缩进/分隔/高亮）
- 语法高亮：YAML 语法着色（key/value/color/结构）
- 可视化面板：字段表单（类型感知：文本/日期/布尔/数组），支持增删字段、拖拽排序
- 实时同步：面板编辑 ↔ YAML 源码双向同步（类似 WYSIWYG 的同步机制）

**技术约束：** M0 spike 已验证 FrontMatter 仅限安全 top-level scalar 编辑（YAML 结构有限）。面板只提供 scalar/简单数组编辑，复杂嵌套结构（如嵌套对象）回退到直接 YAML 编辑。

---

## 2. 主题

### 方案：CSS 文件即主题（Typora 风格）

**现状基础（已验证 2026-08-30）：**
MarkFlow 主题机制是**干净的 CSS 变量 token system**：
- `src/styles/variables.css`：`:root` 定义 ~13 个语义色 token（`--bg`/`--surface`/`--fg`/`--muted`/`--border`/`--accent`/`--code-bg`/`--selection`/`--shadow` 等）+ 3 个字体 token（`--font-body`/`--font-code`/`--font-ui`）
- 三套内建主题（light/dark/sepia）仅给 `[data-theme="X"]` 属性换变量值
- `src/lib/theme.ts`：`setTheme()` 设 `data-theme` 属性 + localStorage 持久化
- **组件无硬编码颜色**，全用 `var(--…)` 引用
- **结论：天然支持"导入一个 `.css` 覆盖 `[data-theme="custom"]` 变量值"即成一枚新主题**

**交付目标：**
1. **自定义主题编辑器**：可视化调色（暴露所有 token，用户点选/输入颜色，实时预览）
2. **导入/导出 `.css`**：以 `.css` 文件为单位导入导出主题，可分享/复用
3. 用户可直接写 `.css` 文件实现自定义主题（无需编辑器也能用）

**进阶（不在此轮主攻）：** 主题市场/商城（在线浏览/下载）、跟随系统偏好（成本很低，可顺手做）

---

## 3. 图床（全新能力）

### 方案：对接 PicGo/PicList 本地服务，不内置协议

**形态确认（用户指定）：** 支持"选择图片插入时直接上传"+ "右键上传本地图片"两条路径。使用 PicGo/PicList 的服务，不内置图床协议。

**技术验证结论（2026-08-30 调研确认）：**
- 唯一现实路径 = 调用用户已安装的 PicGo(≥2.2.0)/PicList 桌面 App 的本地 HTTP 服务
- 地址：`http://127.0.0.1:36677/upload`（默认端口，可自动递增）
- 协议：`POST /upload`，body `{"list":[绝对路径]}`；或 **`multipart/form-data`（字段 `files`）** 推荐，避免 Tauri 路径可见性问题
- 响应：`{"success":true,"result":[url]}`
- CORS `*`，本地默认无鉴权；**凭据全由 PicGo 持有，MarkFlow 零持密**
- `/heartbeat` 探活端点可检测服务在线

**技术路径：**
- 服务检测：启动时/上传前探测端口连通性，不可达则引导用户安装 PicGo/PicList
- 端口可配置（应对占用 +1、用户自定义）
- 上传路径：前端 `fetch`（或 Rust `reqwest`）→ multipart 上传 → URL 回填替换文档中本地引用
- 首次接入：「插入时直接上传」；二次：右键上传已粘贴的本地图片
- 兜底（无 PicGo 用户）：提供"自定义 HTTP 图床 API"配置（multipart POST + 配置返回 URL 字段路径）

**已知风险：**
- 用户未安装/未启动 App → 连接被拒，需清晰引导
- PicGo 与 PicList 同时运行争用端口 → 两者都有自动 +1 逻辑，实际只有一个在监听
- macOS 隐私限制：WebView fetch 调本地服务端口需要用户在系统设置里允许（或走 Rust 侧 reqwest 绕过）

---

## 4. 优化

### 定位
**用户感知为主 + 窄架构优化**。红线：不碰 #254/#255 编辑链路大重构、不做 markflow-core 分层迁移。

**已量化的瓶颈（探索确认）：**
- Bundle 8.7MB（JS 4.8MB + 字体 3.8MB），中文字体 3.7MB 逼近 4MB 红线
- 5 处动态/静态导入冲突（`@codemirror/*`、`plantuml-lazy.ts`、`editor.ts` 重复打包）
- 文件树 100k 文件已量化，但 >5000 可见节点未虚拟化
- parser p95 未冻结（M0 spike 遗留）

**主攻候选（按用户可感知度 × 成本排序）：**

| 优先级 | 优化项 | 用户可感知 | 成本 |
|--------|--------|-----------|------|
| 🥇 | 启动/首屏懒加载、按需拆分 | 极高（打开就要等） | 中 |
| 🥈 | 大文件打开/编辑流畅度（现有分级降级基础） | 高 | 中 |
| 🥉 | Bundle 体积（拆包、修 5 处动态导入冲突、字体瘦身） | 中（首次加载） | 中 |
| 补充 | 源码模式自动换行（CodeMirror `lineWrapping`） | 高（使用习惯） | 低 |
| 窄架构 | 文件树虚拟化（>5000 可见节点） | 高（大目录场景） | 中 |

---

## 5. 修复

**低强度维护性：**
- 归档收尾 `fix-trailing-newlines-lost`（#189 副本，已做 `ead3121` 但 change 目录未归档）
- 五方向开发中顺手修暴露的 bug（不作为专项）

---

## 开放问题（待决策）

1. **五方向的实现顺序**：先定方案，排序待后续决定
2. **各方向内的子项优先级**：增强方向内 KaTeX / 表格 / frontmatter 谁先？
3. **版本目标**：这次五方向完成后对应 v0.1.0 还是更大版本？
4. **表格局限**：Tiptap 现有表格支持的具体缺失（`m7a-gfm-table` 分支完成了多少、还差多少）需要拆解

---

*文档由 2026-08-30 讨论会话生成，存入 `docs/` 供团队审阅。*
