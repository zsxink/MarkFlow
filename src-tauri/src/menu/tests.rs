use super::*;
use crate::menu::recent::recent_label;
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
            "close-workspace",
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
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/utils/keyboard.ts");
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
        "关闭工作区",
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
    // No workspace -> new file/folder and close-workspace disabled.
    assert_eq!(requires("new-file"), Some(Requires::Workspace));
    assert_eq!(requires("new-folder"), Some(Requires::Workspace));
    assert_eq!(requires("close-workspace"), Some(Requires::Workspace));
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
