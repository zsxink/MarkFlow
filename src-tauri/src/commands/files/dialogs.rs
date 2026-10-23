//! Save-dialog export commands.
//!
//! These bypass the workspace boundary on purpose: an export is written wherever
//! the user picks in the native save dialog (see the `export-workspace-bypass`
//! spec), and the dialog result is the only accepted destination.

use crate::http::MAX_IMAGE_SIZE;
use crate::paths::normalize_path;
use base64::Engine;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tracing::info;

fn select_export_path(
    app: &AppHandle,
    title: &str,
    file_name: &str,
    filter_name: &str,
    extensions: &[&str],
) -> Result<Option<PathBuf>, String> {
    let Some(path) = app
        .dialog()
        .file()
        .set_title(title)
        .set_file_name(file_name)
        .add_filter(filter_name, extensions)
        .blocking_save_file()
    else {
        return Ok(None);
    };

    path.into_path()
        .map(Some)
        .map_err(|_| "Invalid save path".into())
}

#[tauri::command]
pub async fn save_mermaid_svg_export(
    svg: String,
    default_name: String,
    app: AppHandle,
) -> Result<bool, String> {
    let file_name = format!("{}.svg", default_name);
    let Some(path) = select_export_path(&app, "图片另存为 SVG", &file_name, "SVG", &["svg"])?
    else {
        return Ok(false);
    };

    fs::write(&path, svg).map_err(|e| format!("Failed to write file: {}", e))?;
    info!(target: "backend.files", path = %normalize_path(&path), "Exported Mermaid SVG");
    Ok(true)
}

#[tauri::command]
pub async fn save_mermaid_png_export(
    data: String,
    default_name: String,
    app: AppHandle,
) -> Result<bool, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Invalid base64 data: {}", e))?;
    if bytes.len() as u64 > MAX_IMAGE_SIZE {
        return Err("文件过大，最大支持 20MB".into());
    }

    let file_name = format!("{}.png", default_name);
    let Some(path) = select_export_path(&app, "图片另存为 PNG", &file_name, "PNG", &["png"])?
    else {
        return Ok(false);
    };

    fs::write(&path, bytes).map_err(|e| format!("Failed to write file: {}", e))?;
    info!(target: "backend.files", path = %normalize_path(&path), "Exported Mermaid PNG");
    Ok(true)
}

#[tauri::command]
pub async fn save_plantuml_svg_export(
    svg: String,
    default_name: String,
    app: AppHandle,
) -> Result<bool, String> {
    let file_name = format!("{}.svg", default_name);
    let Some(path) = select_export_path(&app, "图片另存为 SVG", &file_name, "SVG", &["svg"])?
    else {
        return Ok(false);
    };

    fs::write(&path, svg).map_err(|e| format!("Failed to write file: {}", e))?;
    info!(target: "backend.files", path = %normalize_path(&path), "Exported PlantUML SVG");
    Ok(true)
}

#[tauri::command]
pub async fn save_plantuml_png_export(
    data: String,
    default_name: String,
    app: AppHandle,
) -> Result<bool, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Invalid base64 data: {}", e))?;
    if bytes.len() as u64 > MAX_IMAGE_SIZE {
        return Err("文件过大，最大支持 20MB".into());
    }

    let file_name = format!("{}.png", default_name);
    let Some(path) = select_export_path(&app, "图片另存为 PNG", &file_name, "PNG", &["png"])?
    else {
        return Ok(false);
    };

    fs::write(&path, bytes).map_err(|e| format!("Failed to write file: {}", e))?;
    info!(target: "backend.files", path = %normalize_path(&path), "Exported PlantUML PNG");
    Ok(true)
}

#[tauri::command]
pub async fn save_image_export(
    data: String,
    file_name: String,
    extension: String,
    app: AppHandle,
) -> Result<bool, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Invalid base64 data: {}", e))?;
    if bytes.len() as u64 > MAX_IMAGE_SIZE {
        return Err("文件过大，最大支持 20MB".into());
    }

    let normalized_extension = extension.trim().trim_start_matches('.').to_lowercase();
    let ext = if normalized_extension.is_empty() {
        "png"
    } else {
        normalized_extension.as_str()
    };
    let Some(path) = select_export_path(&app, "图片另存为", &file_name, "图片", &[ext])?
    else {
        return Ok(false);
    };

    fs::write(&path, bytes).map_err(|e| format!("Failed to write file: {}", e))?;
    info!(target: "backend.files", path = %normalize_path(&path), extension = %ext, "Exported image");
    Ok(true)
}

#[tauri::command]
pub async fn save_document_export(
    content: String,
    default_name: String,
    filter_name: String,
    extensions: Vec<String>,
    app: AppHandle,
) -> Result<bool, String> {
    let ext_refs: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
    let Some(path) = select_export_path(&app, "导出文档", &default_name, &filter_name, &ext_refs)?
    else {
        return Ok(false);
    };

    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))?;
    info!(target: "backend.files", path = %normalize_path(&path), "Exported document");
    Ok(true)
}
