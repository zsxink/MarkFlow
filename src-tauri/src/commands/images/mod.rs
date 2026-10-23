//! Image pipeline commands, split by responsibility:
//!
//! - [`storage`]  — storage-mode resolution, directory safety, destination checks
//! - [`pending`]  — unsaved-document drafts (manifest, migration, expiry cleanup)
//! - [`io`]       — byte validation, asset scope grants, bounded remote fetch
//! - [`commands`] — the `#[tauri::command]` surface

pub mod commands;
pub mod io;
pub mod pending;
pub mod storage;

pub use commands::*;

#[cfg(test)]
mod tests;
