//! Native application menu bar (issue #362).
//!
//! The menu is first described as pure data ([`menu_specs`]) so that the
//! ordering, Chinese labels, accelerators and platform differences can be
//! asserted in unit tests without a running application. [`build`] turns the
//! description into Tauri menu items, state-dependent handles are kept in
//! [`MenuHandles`] so the frontend can enable/disable them, and [`dispatch`]
//! forwards application action ids to the frontend dispatcher
//! (`src/ui/native-menu.ts`), which reuses the existing command
//! implementations. No business logic is duplicated in Rust.
//!
//! Split by concern: this module holds the pure description ([`Requires`],
//! [`Entry`], [`menu_specs`]), `native.rs` builds the Tauri items,
//! `recent.rs` maintains the recent-history submenus, and `dispatch.rs` routes
//! activations to the frontend.

pub mod dispatch;
pub mod native;
pub mod recent;

pub use native::build;

#[cfg(test)]
mod tests;

/// Event emitted to the frontend when an application menu item is activated.
pub const MENU_ACTION_EVENT: &str = "menu:action";
/// macOS application menu title (system requirement, never localized).
pub const APP_MENU_TITLE: &str = "MarkFlow";
/// Id prefix for a "recent files" entry: `recent-file:<path>`.
pub const RECENT_FILE_PREFIX: &str = "recent-file:";
/// Id prefix for a "recent folders" entry: `recent-folder:<path>`.
pub const RECENT_FOLDER_PREFIX: &str = "recent-folder:";

pub(crate) const EXPORT_SUBMENU_TITLE: &str = "导出";
pub(crate) const RECENT_FILES_TITLE: &str = "最近打开的文件";
pub(crate) const RECENT_FOLDERS_TITLE: &str = "最近打开的文件夹";
pub(crate) const DEVTOOLS_ACTION: &str = "devtools";

/// Application state required for a menu item to be enabled.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Requires {
    /// Always enabled (dialog / view actions with no document dependency).
    Always,
    /// Needs an open workspace folder.
    Workspace,
    /// Needs an active document tab.
    Document,
    /// Only available in debug builds: the webview inspector is compiled out of
    /// release builds, so the item must look disabled rather than silently do
    /// nothing (spec: an unavailable capability stays visible but disabled).
    DebugOnly,
    /// Not implemented yet: rendered in place but permanently disabled.
    Placeholder,
}

/// System (OS-provided) menu items used by the menu bar.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Native {
    About,
    Services,
    Hide,
    HideOthers,
    ShowAll,
    Quit,
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    SelectAll,
    Minimize,
    Maximize,
    Fullscreen,
}

/// One entry of a (sub)menu description.
#[derive(Clone, Debug)]
pub enum Entry {
    /// Application action: dispatched to the frontend by id.
    Item {
        id: &'static str,
        label: &'static str,
        accelerator: Option<&'static str>,
        requires: Requires,
    },
    /// System-provided item with a Chinese label.
    System {
        kind: Native,
        label: &'static str,
    },
    /// Nested submenu whose own enabled state may depend on app state.
    Submenu {
        title: &'static str,
        requires: Requires,
        entries: Vec<Entry>,
    },
    /// "最近打开的文件" submenu, rebuilt from the reported recent list.
    RecentFiles,
    /// "最近打开的文件夹" submenu, rebuilt from the reported recent list.
    RecentFolders,
    Separator,
}

/// A top-level menu description.
#[derive(Clone, Debug)]
pub struct MenuSpec {
    pub title: &'static str,
    pub entries: Vec<Entry>,
}

/// Platform family the menu bar is built for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Platform {
    /// macOS: has the leading application menu, no settings/quit in 文件.
    MacOs,
    /// Windows/Linux: no application menu, settings and quit live in 文件.
    Desktop,
}

/// Application state reported by the frontend.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct MenuState {
    pub has_workspace: bool,
    pub has_document: bool,
    pub recent_files: Vec<String>,
    pub recent_folders: Vec<String>,
}

/// The platform this build targets.
pub fn current_platform() -> Platform {
    if cfg!(target_os = "macos") {
        Platform::MacOs
    } else {
        Platform::Desktop
    }
}

/// Pure enablement mapping: state payload + requirement -> enabled flag.
pub fn enabled_for(requires: Requires, state: &MenuState) -> bool {
    match requires {
        Requires::Always => true,
        Requires::Workspace => state.has_workspace,
        Requires::Document => state.has_document,
        Requires::DebugOnly => cfg!(debug_assertions),
        Requires::Placeholder => false,
    }
}

fn item(
    id: &'static str,
    label: &'static str,
    accelerator: Option<&'static str>,
    requires: Requires,
) -> Entry {
    Entry::Item {
        id,
        label,
        accelerator,
        requires,
    }
}

fn system(kind: Native, label: &'static str) -> Entry {
    Entry::System { kind, label }
}

/// Describe the whole menu bar for the given platform.
pub fn menu_specs(platform: Platform) -> Vec<MenuSpec> {
    let mut menus = Vec::new();
    if platform == Platform::MacOs {
        menus.push(app_menu());
    }
    menus.push(file_menu(platform));
    menus.push(edit_menu());
    menus.push(insert_menu());
    menus.push(format_menu());
    menus.push(view_menu());
    menus.push(window_menu());
    menus.push(help_menu(platform));
    menus
}
fn app_menu() -> MenuSpec {
    MenuSpec {
        title: APP_MENU_TITLE,
        entries: vec![
            system(Native::About, "关于 MarkFlow"),
            item("check-updates", "检查更新", None, Requires::Placeholder),
            Entry::Separator,
            item("settings", "设置…", Some("CmdOrCtrl+,"), Requires::Always),
            Entry::Separator,
            system(Native::Services, "服务"),
            Entry::Separator,
            system(Native::Hide, "隐藏 MarkFlow"),
            system(Native::HideOthers, "隐藏其他"),
            system(Native::ShowAll, "显示全部"),
            Entry::Separator,
            system(Native::Quit, "退出 MarkFlow"),
        ],
    }
}

fn file_menu(platform: Platform) -> MenuSpec {
    let mut entries = vec![
        // No workspace is fine: the dialog falls back to a system save dialog
        // (src/ui/new-file-dialog.ts), so gating it on a workspace hid a
        // capability the app actually has (issue #410).
        item(
            "new-file",
            "新建文件",
            Some("CmdOrCtrl+N"),
            Requires::Always,
        ),
        item(
            "new-tab",
            "新建标签页",
            Some("CmdOrCtrl+T"),
            Requires::Always,
        ),
        item(
            "new-folder",
            "新建文件夹",
            Some("Shift+CmdOrCtrl+N"),
            Requires::Workspace,
        ),
        Entry::Separator,
        item(
            "open-file",
            "打开文件…",
            Some("CmdOrCtrl+O"),
            Requires::Always,
        ),
        item("open-folder", "打开文件夹…", None, Requires::Always),
        item("close-workspace", "关闭文件夹", None, Requires::Workspace),
        item(
            "quick-switch",
            "快速切换…（按名称跳文件）",
            Some("CmdOrCtrl+P"),
            Requires::Placeholder,
        ),
        Entry::Separator,
        // Document only: without a path the save dialog asks where to write
        // (src/ui/sidebar/fileops.ts), so a workspace is not a prerequisite.
        item("save", "保存", Some("CmdOrCtrl+S"), Requires::Document),
        // The issue table lists Shift+Cmd+S for 另存为 as well, but 删除线 owns
        // that accelerator today (documented in 设置 → 快捷键, and required by the
        // keyboard-shortcuts spec). Two menu items cannot share one native
        // accelerator, so 另存为 keeps the menu item without a shortcut.
        item("save-as", "另存为…", None, Requires::Document),
        Entry::Separator,
        Entry::Submenu {
            title: EXPORT_SUBMENU_TITLE,
            requires: Requires::Document,
            entries: vec![
                item("export-html", "HTML", None, Requires::Document),
                item("export-pdf", "PDF", None, Requires::Document),
                item("export-word", "Word", None, Requires::Document),
            ],
        },
        Entry::Separator,
        Entry::RecentFiles,
        Entry::RecentFolders,
        item("clear-history", "清除历史记录", None, Requires::Always),
        Entry::Separator,
        item(
            "close-tab",
            "关闭标签页",
            Some("CmdOrCtrl+W"),
            Requires::Document,
        ),
        item(
            "close-window",
            "关闭窗口",
            Some("Shift+CmdOrCtrl+W"),
            Requires::Always,
        ),
    ];

    if platform == Platform::Desktop {
        entries.push(Entry::Separator);
        entries.push(item(
            "settings",
            "设置…",
            Some("CmdOrCtrl+,"),
            Requires::Always,
        ));
        entries.push(item("quit", "退出", Some("CmdOrCtrl+Q"), Requires::Always));
    }

    MenuSpec {
        title: "文件",
        entries,
    }
}

fn edit_menu() -> MenuSpec {
    MenuSpec {
        title: "编辑",
        entries: vec![
            system(Native::Undo, "撤销"),
            system(Native::Redo, "重做"),
            Entry::Separator,
            system(Native::Cut, "剪切"),
            system(Native::Copy, "复制"),
            system(Native::Paste, "粘贴"),
            system(Native::SelectAll, "全选"),
            Entry::Separator,
            item("find", "查找…", Some("CmdOrCtrl+F"), Requires::Placeholder),
            item(
                "replace",
                "替换…",
                Some("Alt+CmdOrCtrl+F"),
                Requires::Placeholder,
            ),
        ],
    }
}

fn insert_menu() -> MenuSpec {
    MenuSpec {
        title: "插入",
        entries: vec![
            item(
                "insert-link",
                "链接",
                Some("CmdOrCtrl+K"),
                Requires::Document,
            ),
            item(
                "insert-markdown-link",
                "Markdown 链接",
                None,
                Requires::Placeholder,
            ),
            item(
                "insert-callout",
                "标注（Callout）",
                None,
                Requires::Placeholder,
            ),
            Entry::Separator,
            item("insert-code-block", "代码块", None, Requires::Document),
            item("insert-math-block", "数学块", None, Requires::Document),
            item("insert-table", "表格", None, Requires::Document),
            item("insert-footnote", "脚注", None, Requires::Placeholder),
            Entry::Separator,
            item("insert-ul", "无序列表", None, Requires::Document),
            item("insert-ol", "有序列表", None, Requires::Document),
            item(
                "insert-task-list",
                "任务列表",
                Some("CmdOrCtrl+L"),
                Requires::Document,
            ),
            Entry::Separator,
            item(
                "insert-image",
                "图片…（插入附件）",
                None,
                Requires::Document,
            ),
            item("insert-fold", "折叠（Fold）", None, Requires::Placeholder),
        ],
    }
}

fn format_menu() -> MenuSpec {
    MenuSpec {
        title: "格式",
        entries: vec![
            item(
                "heading-1",
                "标题 1",
                Some("CmdOrCtrl+1"),
                Requires::Document,
            ),
            item(
                "heading-2",
                "标题 2",
                Some("CmdOrCtrl+2"),
                Requires::Document,
            ),
            item(
                "heading-3",
                "标题 3",
                Some("CmdOrCtrl+3"),
                Requires::Document,
            ),
            item(
                "heading-4",
                "标题 4",
                Some("CmdOrCtrl+4"),
                Requires::Placeholder,
            ),
            item(
                "heading-5",
                "标题 5",
                Some("CmdOrCtrl+5"),
                Requires::Placeholder,
            ),
            item(
                "heading-6",
                "标题 6",
                Some("CmdOrCtrl+6"),
                Requires::Placeholder,
            ),
            item("paragraph", "正文", Some("CmdOrCtrl+0"), Requires::Document),
            Entry::Separator,
            item("bold", "粗体", Some("CmdOrCtrl+B"), Requires::Document),
            item("italic", "斜体", Some("CmdOrCtrl+I"), Requires::Document),
            item(
                "inline-code",
                "行内代码",
                Some("CmdOrCtrl+`"),
                Requires::Document,
            ),
            item("highlight", "高亮", None, Requires::Placeholder),
            Entry::Separator,
            item(
                "strike",
                "删除线",
                Some("Shift+CmdOrCtrl+S"),
                Requires::Document,
            ),
            item("inline-math", "数学公式（行内）", None, Requires::Document),
            // Cmd+/ is owned by 切换所见即所得/源码; a placeholder must not
            // register a second accelerator for it.
            item("comment", "注释（`%%`）", None, Requires::Placeholder),
        ],
    }
}

fn view_menu() -> MenuSpec {
    MenuSpec {
        title: "视图",
        entries: vec![
            item(
                "toggle-mode",
                "切换所见即所得/源码",
                Some("CmdOrCtrl+/"),
                Requires::Always,
            ),
            item(
                "toggle-sidebar",
                "切换侧边栏",
                Some("CmdOrCtrl+\\"),
                Requires::Always,
            ),
            item("show-tree", "显示文件树", None, Requires::Always),
            item("show-outline", "显示大纲", None, Requires::Always),
            Entry::Separator,
            item(
                "focus-mode",
                "专注模式",
                Some("Shift+CmdOrCtrl+F"),
                Requires::Always,
            ),
            item("toggle-theme", "切换主题", None, Requires::Always),
            Entry::Separator,
            item(
                "zoom-in",
                "放大",
                Some("CmdOrCtrl+="),
                Requires::Placeholder,
            ),
            item(
                "zoom-out",
                "缩小",
                Some("CmdOrCtrl+-"),
                Requires::Placeholder,
            ),
            // Cmd+0 is owned by 正文; see the accelerator-uniqueness test.
            item("zoom-reset", "重置缩放", None, Requires::Placeholder),
            Entry::Separator,
            system(Native::Fullscreen, "全屏"),
            item(
                "devtools",
                "开发者工具",
                Some("Alt+CmdOrCtrl+I"),
                Requires::DebugOnly,
            ),
        ],
    }
}

fn window_menu() -> MenuSpec {
    MenuSpec {
        title: "窗口",
        entries: vec![
            system(Native::Minimize, "最小化"),
            system(Native::Maximize, "缩放"),
            Entry::Separator,
            item(
                "next-tab",
                "下一个标签页",
                Some("Ctrl+Tab"),
                Requires::Always,
            ),
            item(
                "previous-tab",
                "上一个标签页",
                Some("Ctrl+Shift+Tab"),
                Requires::Always,
            ),
            item(
                "reopen-tab",
                "恢复关闭的标签页",
                Some("Shift+CmdOrCtrl+T"),
                Requires::Always,
            ),
            item("close-all-tabs", "关闭所有标签页", None, Requires::Document),
        ],
    }
}

fn help_menu(platform: Platform) -> MenuSpec {
    let mut entries = vec![
        item("shortcuts", "快捷键一览", None, Requires::Placeholder),
        item("open-logs", "打开日志目录", None, Requires::Always),
        item(
            "feedback",
            "问题反馈（GitHub Issue）",
            None,
            Requires::Always,
        ),
    ];
    if platform == Platform::Desktop {
        entries.push(Entry::Separator);
        entries.push(system(Native::About, "关于 MarkFlow"));
    }
    MenuSpec {
        title: "帮助",
        entries,
    }
}
