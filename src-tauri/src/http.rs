//! Networking facade.
//!
//! The command layer imports `crate::http::*` only; the implementation lives in
//! [`crate::net`] split by concern (URL/IP validation, DNS, redirects, magic
//! bytes, log redaction, redirect-following fetch).

pub use crate::net::dns::ValidatingResolver;
pub use crate::net::fetch::fetch_with_redirects;
pub use crate::net::magic::validate_image_magic;
pub use crate::net::redact::redact_url_for_log;
pub use crate::net::url::validate_external_url;
pub use crate::net::{MAX_IMAGE_SIZE, MAX_TITLE_LEN, MAX_TITLE_READ_BYTES};

#[cfg(test)]
mod tests;
