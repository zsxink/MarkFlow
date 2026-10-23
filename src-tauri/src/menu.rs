//! Native application menu bar (issue #362).
//!
//! The menu is first described as pure data ([`menu_specs`]) so that the
//! ordering, Chinese labels, accelerators and platform differences can be
//! asserted in unit tests without a running application. [`build`] turns that
//! description into Tauri menu items, state-dependent handles are kept in
//! [`MenuHandles`] so the frontend can enable/disable them, and [`dispatch`]
//! forwards application action ids to the frontend dispatcher
//! (`src/utils/nativeMenu.ts`), which reuses the existing command
//! implementations. No business logic is duplicated in Rust.

use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Wry};

use std::sync::Mutex;

/// Event emitted to the frontend when an application menu item is activated.
pub const MENU_ACTION_EVENT: &str = "menu:action";
/// macOS application menu title (system requirement, never localized).
pub const APP_MENU_TITLE: &str = "MarkFlow";
/// Prefix of dynamically built "recent files" items: `recent-file:<path>`.
pub const RECENT_FILE_PREFIX: &str = "recent-file:";
/// Prefix of dynamically built "recent folders" items: `recent-folder:<path>`.
pub const RECENT_FOLDER_PREFIX: &str = "recent-folder:";

const EXPORT_SUBMENU_TITLE: &str = "导出";
const RECENT_FILES_TITLE: &str = "最近打开的文件";
const RECENT_FOLDERS_TITLE: &str = "最近打开的文件夹";
const DEVTOOLS_ACTION: &str = "devtools";

/// Application state required for a menu item to be enabled.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Requires {
    /// Always enabled (dialog / view actions with no document dependency).
    Always,
    /// Needs an open workspace folder.
    Workspace,
    /// Needs an active document tab.
    Document,
    /// Needs an open workspace folder and an active document tab.
    WorkspaceAndDocument,
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
        Requires::WorkspaceAndDocument => state.has_workspace && state.has_document,
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
        item(
            "new-file",
            "新建文件",
            Some("CmdOrCtrl+N"),
            Requires::Workspace,
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
        item(
            "quick-switch",
            "快速切换…（按名称跳文件）",
            Some("CmdOrCtrl+P"),
            Requires::Placeholder,
        ),
        Entry::Separator,
        item(
            "save",
            "保存",
            Some("CmdOrCtrl+S"),
            Requires::WorkspaceAndDocument,
        ),
        // The issue table lists Shift+Cmd+S for 另存为 as well, but 删除线 owns
        // that accelerator today (documented in 设置 → 快捷键, and required by the
        // keyboard-shortcuts spec). Two menu items cannot share one native
        // accelerator, so 另存为 keeps the menu item without a shortcut.
        item("save-as", "另存为…", None, Requires::WorkspaceAndDocument),
        Entry::Separator,
        Entry::Submenu {
            title: EXPORT_SUBMENU_TITLE,
            requires: Requires::WorkspaceAndDocument,
            entries: vec![
                item("export-html", "HTML", None, Requires::WorkspaceAndDocument),
                item("export-pdf", "PDF", None, Requires::WorkspaceAndDocument),
                item("export-word", "Word", None, Requires::WorkspaceAndDocument),
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

/// Handles of the items whose enabled state follows the reported app state.
#[derive(Default)]
pub struct MenuHandles {
    items: Vec<(Requires, MenuItem<Wry>)>,
    submenus: Vec<(Requires, Submenu<Wry>)>,
    recent_files: Option<Submenu<Wry>>,
    recent_folders: Option<Submenu<Wry>>,
    /// Last applied payload. Every `set_enabled` is a blocking main-thread
    /// round-trip, so an unchanged payload must not touch ~40 items again.
    last_applied: Mutex<Option<MenuState>>,
}

impl MenuHandles {
    /// Apply a state payload to every state-dependent item.
    pub fn apply(&self, state: &MenuState) -> tauri::Result<()> {
        {
            let mut last = self
                .last_applied
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if last.as_ref() == Some(state) {
                return Ok(());
            }
            *last = Some(state.clone());
        }
        for (requires, item) in &self.items {
            item.set_enabled(enabled_for(*requires, state))?;
        }
        for (requires, submenu) in &self.submenus {
            submenu.set_enabled(enabled_for(*requires, state))?;
        }
        if let Some(submenu) = &self.recent_files {
            rebuild_recent_submenu(submenu, RECENT_FILE_PREFIX, &state.recent_files)?;
        }
        if let Some(submenu) = &self.recent_folders {
            rebuild_recent_submenu(submenu, RECENT_FOLDER_PREFIX, &state.recent_folders)?;
        }
        Ok(())
    }

    fn track(&mut self, requires: Requires, item: MenuItem<Wry>) {
        if requires != Requires::Always {
            self.items.push((requires, item));
        }
    }

    fn track_submenu(&mut self, requires: Requires, submenu: Submenu<Wry>) {
        if requires != Requires::Always {
            self.submenus.push((requires, submenu));
        }
    }
}

fn native_item(
    app: &AppHandle,
    kind: Native,
    label: &'static str,
) -> tauri::Result<PredefinedMenuItem<Wry>> {
    let text = Some(label);
    match kind {
        // Windows/Linux render the about dialog from the metadata; macOS uses
        // the bundle's own about panel.
        Native::About => PredefinedMenuItem::about(
            app,
            text,
            Some(
                tauri::menu::AboutMetadataBuilder::new()
                    .name(Some("MarkFlow"))
                    .version(Some(env!("CARGO_PKG_VERSION")))
                    .comments(Some("所见即所得 Markdown 编辑器"))
                    .build(),
            ),
        ),
        Native::Services => PredefinedMenuItem::services(app, text),
        Native::Hide => PredefinedMenuItem::hide(app, text),
        Native::HideOthers => PredefinedMenuItem::hide_others(app, text),
        Native::ShowAll => PredefinedMenuItem::show_all(app, text),
        Native::Quit => PredefinedMenuItem::quit(app, text),
        Native::Undo => PredefinedMenuItem::undo(app, text),
        Native::Redo => PredefinedMenuItem::redo(app, text),
        Native::Cut => PredefinedMenuItem::cut(app, text),
        Native::Copy => PredefinedMenuItem::copy(app, text),
        Native::Paste => PredefinedMenuItem::paste(app, text),
        Native::SelectAll => PredefinedMenuItem::select_all(app, text),
        Native::Minimize => PredefinedMenuItem::minimize(app, text),
        Native::Maximize => PredefinedMenuItem::maximize(app, text),
        Native::Fullscreen => PredefinedMenuItem::fullscreen(app, text),
    }
}

/// Build the native menu bar and the handles needed for state updates.
pub fn build(app: &AppHandle) -> tauri::Result<(Menu<Wry>, MenuHandles)> {
    let mut handles = MenuHandles::default();
    let mut roots: Vec<Box<dyn IsMenuItem<Wry>>> = Vec::new();

    for spec in menu_specs(current_platform()) {
        roots.push(Box::new(build_submenu(
            app,
            spec.title,
            &spec.entries,
            &mut handles,
        )?));
    }

    let refs: Vec<&dyn IsMenuItem<Wry>> = roots.iter().map(|item| item.as_ref()).collect();
    let menu = Menu::with_items(app, &refs)?;
    Ok((menu, handles))
}

fn build_submenu(
    app: &AppHandle,
    title: &str,
    entries: &[Entry],
    handles: &mut MenuHandles,
) -> tauri::Result<Submenu<Wry>> {
    // State-dependent items start disabled and are enabled by the first
    // `update_menu_state` call, so an unknown state can never expose an
    // action that would fail.
    let initial = MenuState::default();
    let mut built: Vec<Box<dyn IsMenuItem<Wry>>> = Vec::new();

    for entry in entries {
        match entry {
            Entry::Item {
                id,
                label,
                accelerator,
                requires,
            } => {
                let menu_item = MenuItem::with_id(
                    app,
                    *id,
                    *label,
                    enabled_for(*requires, &initial),
                    *accelerator,
                )?;
                handles.track(*requires, menu_item.clone());
                built.push(Box::new(menu_item));
            }
            Entry::System { kind, label } => {
                built.push(Box::new(native_item(app, *kind, label)?));
            }
            Entry::Submenu {
                title,
                requires,
                entries,
            } => {
                let submenu = build_submenu(app, title, entries, handles)?;
                submenu.set_enabled(enabled_for(*requires, &initial))?;
                handles.track_submenu(*requires, submenu.clone());
                built.push(Box::new(submenu));
            }
            Entry::RecentFiles => {
                let submenu = Submenu::with_items(app, RECENT_FILES_TITLE, false, &[])?;
                handles.recent_files = Some(submenu.clone());
                built.push(Box::new(submenu));
            }
            Entry::RecentFolders => {
                let submenu = Submenu::with_items(app, RECENT_FOLDERS_TITLE, false, &[])?;
                handles.recent_folders = Some(submenu.clone());
                built.push(Box::new(submenu));
            }
            Entry::Separator => {
                built.push(Box::new(PredefinedMenuItem::separator(app)?));
            }
        }
    }

    let refs: Vec<&dyn IsMenuItem<Wry>> = built.iter().map(|item| item.as_ref()).collect();
    Submenu::with_items(app, title, true, &refs)
}

/// Replace the recent-history submenu entries with the reported paths.
/// Rebuilds only when the list actually changed so repeated state syncs do not
/// churn native menu items.
fn rebuild_recent_submenu(
    submenu: &Submenu<Wry>,
    prefix: &str,
    paths: &[String],
) -> tauri::Result<()> {
    let expected: Vec<String> = dedup_paths(paths)
        .into_iter()
        .map(|path| format!("{prefix}{path}"))
        .collect();
    let current: Vec<String> = submenu
        .items()?
        .iter()
        .map(|item| item.id().as_ref().to_string())
        .collect();

    if current != expected {
        for existing in submenu.items()? {
            submenu.remove(&existing)?;
        }
        for id in &expected {
            let path = id.strip_prefix(prefix).unwrap_or(id);
            let menu_item = MenuItem::with_id(
                submenu.app_handle(),
                id.as_str(),
                recent_label(path),
                true,
                None::<&str>,
            )?;
            submenu.append(&menu_item)?;
        }
    }

    submenu.set_enabled(!expected.is_empty())
}

fn dedup_paths(paths: &[String]) -> Vec<&str> {
    let mut seen = std::collections::HashSet::new();
    paths
        .iter()
        .map(|path| path.as_str())
        .filter(|path| !path.is_empty() && seen.insert(*path))
        .collect()
}

/// Menu label for a recent path: the file/folder name, falling back to the path.
fn recent_label(path: &str) -> String {
    path.rsplit(['/', '\\'])
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or(path)
        .to_string()
}

/// Report frontend state so the native menu reflects what is available.
///
/// The menu bar is application-wide but MarkFlow can host several windows
/// (`open_file_in_new_window`), so the last reported state wins. Each window
/// therefore reports whenever its own workspace/document state changes, which
/// keeps the menu aligned with the window the user just acted in — the same
/// window `dispatch` targets.
#[tauri::command]
pub fn update_menu_state(
    app: AppHandle,
    has_workspace: bool,
    has_document: bool,
    recent_files: Vec<String>,
    recent_folders: Vec<String>,
) -> Result<(), String> {
    let state = MenuState {
        has_workspace,
        has_document,
        recent_files,
        recent_folders,
    };
    app.state::<MenuHandles>().apply(&state).map_err(|error| {
        tracing::warn!(
            target: "backend.menu",
            error = %error,
            "Failed to update native menu state"
        );
        error.to_string()
    })
}

/// Handle a native menu event: forward the application action id to the
/// focused window's frontend dispatcher (the only Rust-side action is opening
/// devtools).
pub fn dispatch(app: &AppHandle, id: &str) {
    tracing::debug!(target: "backend.menu", action = %id, "Native menu action");
    let Some(window) = target_window(app) else {
        tracing::warn!(target: "backend.menu", action = %id, "No window to dispatch the menu action to");
        return;
    };
    if id == DEVTOOLS_ACTION {
        open_devtools(&window);
        return;
    }
    if let Err(error) = window.emit(MENU_ACTION_EVENT, id) {
        tracing::warn!(target: "backend.menu", action = %id, error = %error, "Failed to emit menu action");
    }
}

/// The menu is application-wide, so actions go to the focused window and fall
/// back to the main window (multi-window support).
fn target_window(app: &AppHandle) -> Option<tauri::WebviewWindow<Wry>> {
    let mut windows = app.webview_windows();
    if let Some(focused) = windows
        .values()
        .find(|window| window.is_focused().unwrap_or(false))
    {
        return Some(focused.clone());
    }
    windows
        .remove("main")
        .or_else(|| windows.into_values().next())
}

fn open_devtools(window: &tauri::WebviewWindow<Wry>) {
    // The project does not enable tauri's `devtools` feature, so the inspector
    // is only available in debug builds.
    #[cfg(debug_assertions)]
    window.open_devtools();
    #[cfg(not(debug_assertions))]
    {
        tracing::debug!(
            target: "backend.menu",
            "Developer tools are unavailable in this build"
        );
        let _ = window;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn walk<'a>(entries: &'a [Entry], visit: &mut impl FnMut(&'a Entry)) {
        for entry in entries {
            visit(entry);
            if let Entry::Submenu { entries, .. } = entry {
                walk(entries, visit);
            }
        }
    }

    fn action_ids(specs: &[MenuSpec]) -> Vec<&'static str> {
        let mut ids = Vec::new();
        for spec in specs {
            walk(&spec.entries, &mut |entry| {
                if let Entry::Item { id, .. } = entry {
                    ids.push(*id);
                }
            });
        }
        ids
    }

    fn accelerators(specs: &[MenuSpec]) -> Vec<(&'static str, &'static str)> {
        let mut found = Vec::new();
        for spec in specs {
            walk(&spec.entries, &mut |entry| {
                if let Entry::Item {
                    id,
                    accelerator: Some(accelerator),
                    ..
                } = entry
                {
                    found.push((*id, *accelerator));
                }
            });
        }
        found
    }

    fn labels(specs: &[MenuSpec]) -> Vec<(&'static str, &'static str)> {
        let mut found = Vec::new();
        for spec in specs {
            walk(&spec.entries, &mut |entry| match entry {
                Entry::Item { id, label, .. } => found.push((*id, *label)),
                Entry::System { label, .. } => found.push(("", *label)),
                Entry::Submenu { title, .. } => found.push(("", *title)),
                Entry::RecentFiles => found.push(("", RECENT_FILES_TITLE)),
                Entry::RecentFolders => found.push(("", RECENT_FOLDERS_TITLE)),
                Entry::Separator => {}
            });
        }
        found
    }

    fn titles(specs: &[MenuSpec]) -> Vec<&'static str> {
        specs.iter().map(|spec| spec.title).collect()
    }

    #[test]
    fn menu_specs_are_well_formed() {
        for platform in [Platform::MacOs, Platform::Desktop] {
            let specs = menu_specs(platform);
            assert!(!specs.is_empty(), "{platform:?} must describe menus");
            for spec in &specs {
                assert!(
                    !spec.entries.is_empty(),
                    "menu {} must not be empty",
                    spec.title
                );
                let mut previous_was_separator = true; // no leading separator
                for entry in &spec.entries {
                    let is_separator = matches!(entry, Entry::Separator);
                    assert!(
                        !(is_separator && previous_was_separator),
                        "menu {} has a duplicate or trailing separator",
                        spec.title
                    );
                    previous_was_separator = is_separator;
                }
                assert!(
                    !previous_was_separator,
                    "menu {} must not end with a separator",
                    spec.title
                );
            }
        }
    }

    #[test]
    fn action_ids_are_unique_and_stable() {
        for platform in [Platform::MacOs, Platform::Desktop] {
            let specs = menu_specs(platform);
            let ids = action_ids(&specs);
            let unique: HashSet<_> = ids.iter().copied().collect();
            assert_eq!(
                unique.len(),
                ids.len(),
                "{platform:?} menu ids must be unique: {ids:?}"
            );
            // Stable ids the frontend dispatcher relies on.
            for required in [
                "new-file",
                "new-tab",
                "new-folder",
                "open-file",
                "open-folder",
                "save",
                "save-as",
                "export-html",
                "export-pdf",
                "export-word",
                "clear-history",
                "close-tab",
                "close-window",
                "insert-link",
                "insert-image",
                "heading-1",
                "paragraph",
                "bold",
                "italic",
                "strike",
                "toggle-mode",
                "toggle-sidebar",
                "focus-mode",
                "toggle-theme",
                "devtools",
                "next-tab",
                "previous-tab",
                "reopen-tab",
                "close-all-tabs",
                "open-logs",
                "feedback",
                "settings",
            ] {
                assert!(
                    unique.contains(required),
                    "{platform:?} menu is missing the {required} action"
                );
            }
        }
    }

    #[test]
    fn accelerators_are_unique() {
        for platform in [Platform::MacOs, Platform::Desktop] {
            let specs = menu_specs(platform);
            let found = accelerators(&specs);
            let mut seen: HashSet<&str> = HashSet::new();
            for (id, accelerator) in &found {
                assert!(
                    seen.insert(accelerator),
                    "duplicate accelerator {accelerator} on {id} ({platform:?})"
                );
            }
        }
    }

    #[test]
    fn keyboard_table_matches_native_accelerators() {
        // Single source of truth (keyboard-shortcuts spec): the frontend mirror
        // in src/utils/keyboard.ts must describe exactly the native accelerators.
        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/utils/keyboard.ts");
        let Ok(source) = std::fs::read_to_string(&path) else {
            // Frontend sources are not always present (crate-only builds).
            return;
        };

        let mut frontend: Vec<(String, bool, bool, bool)> = Vec::new();
        for line in source.lines() {
            let line = line.trim();
            if !line.starts_with("{ key:") {
                continue;
            }
            let field = |name: &str| -> Option<String> {
                let start = line.find(name)? + name.len();
                let rest = &line[start..];
                let quote = rest.find('\'')? + 1;
                let rest = &rest[quote..];
                let end = rest.find('\'')?;
                Some(rest[..end].to_string())
            };
            let Some(key) = field("key: ") else {
                continue;
            };
            // Source literals escape a single backslash as `\\`; normalize so the
            // comparison uses the character the user actually types.
            let key = key.replace("\\\\", "\\");
            frontend.push((
                key,
                line.contains("shift: true"),
                line.contains("alt: true"),
                line.contains("controlOnly: true"),
            ));
        }
        assert!(
            !frontend.is_empty(),
            "could not parse NATIVE_MENU_SHORTCUTS from {}",
            path.display()
        );

        let mut native: Vec<(String, bool, bool)> = Vec::new();
        for platform in [Platform::MacOs, Platform::Desktop] {
            for (_, accelerator) in accelerators(&menu_specs(platform)) {
                let mut parts: Vec<&str> = accelerator.split('+').collect();
                let key = parts
                    .pop()
                    .unwrap_or_default()
                    .replace("\\\\", "\\")
                    .to_lowercase();
                let modifiers = parts;
                let entry = (
                    key,
                    modifiers
                        .iter()
                        .any(|part| part.eq_ignore_ascii_case("SHIFT")),
                    modifiers
                        .iter()
                        .any(|part| part.eq_ignore_ascii_case("ALT")),
                );
                if !native.contains(&entry) {
                    native.push(entry);
                }
            }
        }

        for (key, shift, alt, control_only) in &frontend {
            let matched = native.iter().any(|(native_key, native_shift, native_alt)| {
                native_key == key && native_shift == shift && native_alt == alt
            });
            // `Ctrl+…`-only accelerators keep the same key/modifier shape here;
            // the Control requirement itself lives in the frontend resolver.
            assert!(
                matched,
                "frontend shortcut {key} (shift={shift}, alt={alt}, controlOnly={control_only}) \
                 has no native accelerator"
            );
        }

        assert_eq!(
            frontend.len(),
            native.len(),
            "native accelerators and the frontend keyboard table diverge: {native:?}"
        );
    }

    #[test]
    fn keyboard_shortcuts_keep_their_owner() {
        let specs = menu_specs(Platform::MacOs);
        let found = accelerators(&specs);
        let owner = |accelerator: &str| {
            found
                .iter()
                .find(|(_, candidate)| *candidate == accelerator)
                .map(|(id, _)| *id)
        };
        assert_eq!(owner("Shift+CmdOrCtrl+S"), Some("strike"));
        assert_eq!(owner("CmdOrCtrl+0"), Some("paragraph"));
        assert_eq!(owner("CmdOrCtrl+/"), Some("toggle-mode"));
    }

    #[test]
    fn platform_layouts_match_the_spec() {
        let macos = menu_specs(Platform::MacOs);
        assert_eq!(
            titles(&macos),
            vec!["MarkFlow", "文件", "编辑", "插入", "格式", "视图", "窗口", "帮助"]
        );
        let desktop = menu_specs(Platform::Desktop);
        assert_eq!(
            titles(&desktop),
            vec!["文件", "编辑", "插入", "格式", "视图", "窗口", "帮助"]
        );

        // macOS: settings in the application menu, no about in 帮助.
        let macos_app = action_ids(&macos[0..1]);
        assert_eq!(macos_app, vec!["check-updates", "settings"]);
        let macos_help = action_ids(&macos[macos.len() - 1..]);
        assert_eq!(macos_help, vec!["shortcuts", "open-logs", "feedback"]);

        // Windows/Linux: settings and quit at the end of 文件, about in 帮助.
        let desktop_file = action_ids(&desktop[0..1]);
        assert_eq!(desktop_file[desktop_file.len() - 2..], ["settings", "quit"]);
        let desktop_help_labels: Vec<&str> = labels(&desktop[desktop.len() - 1..])
            .iter()
            .map(|(_, label)| *label)
            .collect();
        assert_eq!(
            desktop_help_labels,
            vec![
                "快捷键一览",
                "打开日志目录",
                "问题反馈（GitHub Issue）",
                "关于 MarkFlow"
            ]
        );
    }

    #[test]
    fn labels_are_chinese() {
        let specs = menu_specs(Platform::MacOs);
        let labels: HashSet<&str> = labels(&specs).iter().map(|(_, label)| *label).collect();
        for expected in [
            "关于 MarkFlow",
            "设置…",
            "服务",
            "隐藏 MarkFlow",
            "隐藏其他",
            "显示全部",
            "退出 MarkFlow",
            "新建文件",
            "新建标签页",
            "新建文件夹",
            "打开文件…",
            "打开文件夹…",
            "保存",
            "另存为…",
            "最近打开的文件",
            "最近打开的文件夹",
            "清除历史记录",
            "关闭标签页",
            "关闭窗口",
            "撤销",
            "重做",
            "剪切",
            "复制",
            "粘贴",
            "全选",
            "查找…",
            "替换…",
            "链接",
            "代码块",
            "数学块",
            "表格",
            "无序列表",
            "有序列表",
            "任务列表",
            "图片…（插入附件）",
            "标题 1",
            "正文",
            "粗体",
            "斜体",
            "行内代码",
            "删除线",
            "数学公式（行内）",
            "切换所见即所得/源码",
            "切换侧边栏",
            "显示文件树",
            "显示大纲",
            "专注模式",
            "切换主题",
            "全屏",
            "开发者工具",
            "最小化",
            "缩放",
            "下一个标签页",
            "上一个标签页",
            "恢复关闭的标签页",
            "关闭所有标签页",
            "快捷键一览",
            "打开日志目录",
            "问题反馈（GitHub Issue）",
        ] {
            assert!(labels.contains(expected), "missing label {expected}");
        }
        for spec in &specs {
            assert!(
                !spec.title.is_ascii() || spec.title == APP_MENU_TITLE,
                "menu title {} must be Chinese",
                spec.title
            );
        }
    }

    #[test]
    fn enablement_follows_reported_state() {
        let empty = MenuState::default();
        assert!(enabled_for(Requires::Always, &empty));
        for requires in [
            Requires::Workspace,
            Requires::Document,
            Requires::WorkspaceAndDocument,
        ] {
            assert!(!enabled_for(requires, &empty));
        }
        // 开发者工具 only exists in debug builds; a release build must show it
        // disabled instead of offering an item that does nothing.
        assert_eq!(
            enabled_for(Requires::DebugOnly, &empty),
            cfg!(debug_assertions)
        );
        assert!(!enabled_for(
            Requires::Placeholder,
            &MenuState {
                has_workspace: true,
                has_document: true,
                recent_files: vec!["/a.md".into()],
                recent_folders: vec!["/w".into()],
            }
        ));

        let workspace_only = MenuState {
            has_workspace: true,
            ..MenuState::default()
        };
        assert!(enabled_for(Requires::Workspace, &workspace_only));
        assert!(!enabled_for(Requires::Document, &workspace_only));
        assert!(!enabled_for(
            Requires::WorkspaceAndDocument,
            &workspace_only
        ));

        let document_only = MenuState {
            has_document: true,
            ..MenuState::default()
        };
        assert!(!enabled_for(Requires::Workspace, &document_only));
        assert!(enabled_for(Requires::Document, &document_only));
        assert!(!enabled_for(Requires::WorkspaceAndDocument, &document_only));

        let full = MenuState {
            has_workspace: true,
            has_document: true,
            ..MenuState::default()
        };
        assert!(enabled_for(Requires::WorkspaceAndDocument, &full));
    }

    #[test]
    fn workspace_document_and_recent_requirements_match_the_spec() {
        let specs = menu_specs(Platform::MacOs);
        let requirements: Vec<(&str, Requires)> = {
            let mut found = Vec::new();
            for spec in &specs {
                walk(&spec.entries, &mut |entry| {
                    if let Entry::Item { id, requires, .. } = entry {
                        found.push((*id, *requires));
                    }
                });
            }
            found
        };
        let requires = |id: &str| {
            requirements
                .iter()
                .find(|(candidate, _)| *candidate == id)
                .map(|(_, requires)| *requires)
        };
        // No workspace -> new file/folder disabled.
        assert_eq!(requires("new-file"), Some(Requires::Workspace));
        assert_eq!(requires("new-folder"), Some(Requires::Workspace));
        // No workspace and no document -> save / save-as / export disabled.
        for id in [
            "save",
            "save-as",
            "export-html",
            "export-pdf",
            "export-word",
        ] {
            assert_eq!(requires(id), Some(Requires::WorkspaceAndDocument), "{id}");
        }
        // No document -> format, insert and close tab disabled.
        for id in [
            "close-tab",
            "heading-1",
            "paragraph",
            "bold",
            "italic",
            "strike",
            "inline-code",
            "insert-link",
            "insert-image",
            "insert-table",
            "insert-math-block",
            "insert-ul",
            "insert-ol",
            "insert-task-list",
        ] {
            assert_eq!(requires(id), Some(Requires::Document), "{id}");
        }
        // 查找/替换 are still unimplemented (⬜ in the issue table), so they are
        // disabled regardless of state — hence also disabled without a document.
        for id in ["find", "replace"] {
            assert_eq!(requires(id), Some(Requires::Placeholder), "{id}");
            assert!(!enabled_for(
                requires(id).unwrap(),
                &MenuState {
                    has_workspace: true,
                    has_document: true,
                    ..MenuState::default()
                }
            ));
        }
        // Unimplemented items stay disabled in every state.
        for id in ["quick-switch", "highlight", "insert-fold", "shortcuts"] {
            assert_eq!(requires(id), Some(Requires::Placeholder), "{id}");
        }
    }

    #[test]
    fn only_devtools_is_handled_in_rust() {
        // Every other id must reach the frontend dispatcher, which owns the
        // application behaviour (design: 菜单不得在 Rust 侧重复实现前端业务逻辑).
        assert_eq!(DEVTOOLS_ACTION, "devtools");
        let specs = menu_specs(current_platform());
        let ids = action_ids(&specs);
        assert!(ids.contains(&DEVTOOLS_ACTION));
        assert_eq!(
            ids.iter().filter(|id| **id == DEVTOOLS_ACTION).count(),
            1,
            "devtools must be declared exactly once"
        );
    }

    #[test]
    fn recent_items_are_forwarded_with_parseable_ids() {
        let state = MenuState {
            has_workspace: true,
            has_document: true,
            recent_files: vec!["/w/notes/a.md".into()],
            recent_folders: vec!["/w/notes".into()],
        };
        assert!(state.recent_files[0].starts_with('/'));
        assert_eq!(recent_label(&state.recent_files[0]), "a.md");
        assert_eq!(recent_label(&state.recent_folders[0]), "notes");
        assert_eq!(recent_label("C:\\Users\\me\\b.md"), "b.md");
        assert_eq!(
            format!("{}{}", RECENT_FILE_PREFIX, state.recent_files[0]),
            "recent-file:/w/notes/a.md"
        );
        assert_eq!(
            format!("{}{}", RECENT_FOLDER_PREFIX, state.recent_folders[0]),
            "recent-folder:/w/notes"
        );
    }
}
