//! Networking infrastructure: URL/IP validation, DNS, redirect checks,
//! magic-byte sniffing, log redaction and the redirect-following fetch.
//!
//! `crate::http` is a thin facade over these modules so the command layer keeps
//! a single import surface.

pub mod dns;
pub mod fetch;
pub mod magic;
pub mod redact;
pub mod redirect;
pub mod url;

/// Maximum image download size (20 MB).
pub const MAX_IMAGE_SIZE: u64 = 20 * 1024 * 1024;

/// Maximum bytes to read when fetching a page title.
pub const MAX_TITLE_READ_BYTES: usize = 256 * 1024;

/// Maximum length of a extracted title string.
pub const MAX_TITLE_LEN: usize = 512;
