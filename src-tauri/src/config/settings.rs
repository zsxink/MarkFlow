use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub version: u32,
    pub theme: String,
    pub font_size: u32,
    pub line_height: f64,
    pub autosave: bool,
    pub autosave_interval: u64,
    pub spellcheck: bool,
    pub soft_wrap: bool,
    pub live_preview: bool,
    pub code_highlight: bool,
    #[serde(default)]
    pub line_numbers: Option<bool>,
    pub show_sidebar: bool,
    pub show_tooltips: bool,
    pub follow_system_theme: bool,
    pub last_workspace: Option<String>,
    #[serde(default)]
    pub image_storage_mode: Option<String>,
    #[serde(default)]
    pub image_custom_path: Option<String>,
    #[serde(default)]
    pub image_prefer_relative: Option<bool>,
    #[serde(default)]
    pub image_auto_copy_local: Option<bool>,
    #[serde(default)]
    pub image_download_network: Option<bool>,
    #[serde(default)]
    pub image_naming_strategy: Option<String>,
    #[serde(default)]
    pub code_line_numbers: Option<bool>,
    #[serde(default)]
    pub code_word_wrap: Option<bool>,
    #[serde(default)]
    pub last_sidebar_tab: Option<String>,
    #[serde(default = "default_large_file_threshold")]
    pub large_file_threshold: u64,
    #[serde(default = "default_huge_file_threshold")]
    pub huge_file_threshold: u64,
    #[serde(default = "default_large_file_line_threshold")]
    pub large_file_line_threshold: u32,
    #[serde(default = "default_huge_file_line_threshold")]
    pub huge_file_line_threshold: u32,
    #[serde(default = "default_file_tree_ignore_patterns")]
    pub file_tree_ignore_patterns: Vec<String>,
    #[serde(default = "default_file_tree_page_size")]
    pub file_tree_page_size: usize,
    #[serde(default = "default_file_tree_auto_load_depth")]
    pub file_tree_auto_load_depth: usize,
    #[serde(default)]
    pub recent_files: Vec<String>,
    #[serde(default)]
    pub recent_folders: Vec<String>,
    #[serde(default = "default_window_width")]
    pub last_window_width: f64,
    #[serde(default = "default_window_height")]
    pub last_window_height: f64,
    #[serde(default)]
    pub last_window_x: f64,
    #[serde(default)]
    pub last_window_y: f64,
}

fn default_window_width() -> f64 {
    1200.0
}
fn default_window_height() -> f64 {
    800.0
}
fn default_large_file_threshold() -> u64 {
    1048576
}
fn default_huge_file_threshold() -> u64 {
    10485760
}
fn default_large_file_line_threshold() -> u32 {
    5000
}
fn default_huge_file_line_threshold() -> u32 {
    50000
}
pub fn default_file_tree_ignore_patterns() -> Vec<String> {
    vec![
        ".git".into(),
        "node_modules".into(),
        "target".into(),
        "dist".into(),
    ]
}
fn default_file_tree_page_size() -> usize {
    500
}
fn default_file_tree_auto_load_depth() -> usize {
    8
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: 1,
            theme: "light".into(),
            font_size: 18,
            line_height: 1.7,
            autosave: true,
            autosave_interval: 10000,
            spellcheck: true,
            soft_wrap: true,
            live_preview: true,
            code_highlight: true,
            line_numbers: None,
            show_sidebar: true,
            show_tooltips: true,
            follow_system_theme: false,
            last_workspace: None,
            image_storage_mode: None,
            image_custom_path: None,
            image_prefer_relative: None,
            image_auto_copy_local: None,
            image_download_network: None,
            image_naming_strategy: None,
            code_line_numbers: None,
            code_word_wrap: None,
            last_sidebar_tab: None,
            large_file_threshold: default_large_file_threshold(),
            huge_file_threshold: default_huge_file_threshold(),
            large_file_line_threshold: default_large_file_line_threshold(),
            huge_file_line_threshold: default_huge_file_line_threshold(),
            file_tree_ignore_patterns: default_file_tree_ignore_patterns(),
            file_tree_page_size: default_file_tree_page_size(),
            file_tree_auto_load_depth: default_file_tree_auto_load_depth(),
            recent_files: vec![],
            recent_folders: vec![],
            last_window_width: 1200.0,
            last_window_height: 800.0,
            last_window_x: 0.0,
            last_window_y: 0.0,
        }
    }
}
