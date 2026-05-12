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
    pub line_numbers: bool,
    pub show_sidebar: bool,
    pub show_tooltips: bool,
    pub follow_system_theme: bool,
    pub last_workspace: Option<String>,
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
            line_numbers: false,
            show_sidebar: true,
            show_tooltips: true,
            follow_system_theme: false,
            last_workspace: None,
        }
    }
}
