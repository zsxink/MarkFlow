//! # markflow-core
//!
//! Lossless Markdown document kernel for MarkFlow (P1A: minimal Core).
//!
//! This crate is intentionally host- and UI-independent: no Tauri, DOM,
//! network, parser, Render IR, widgets or History (task 2.1 boundary). It owns
//! the byte-fidelity contract:
//!
//! - [`OriginalSnapshot`] — raw hash/length, BOM, per-boundary EOL, trailing
//!   newlines and frozen file identity.
//! - [`TextBuffer`] — logical LF text + per-boundary EOL provenance; untouched
//!   bytes replay exactly.
//! - [`PositionMap`] — UTF-16 / logical UTF-8 byte / source byte conversion
//!   with branded offset types.
//! - [`TextPatch`] — revision-bound atomic patches with idempotent retry.
//! - [`LosslessDocumentSession`] — open / apply / snapshot / prepare-save /
//!   mark-persisted / reload / close state machine.
//!
//! `ContentHash` is SHA-256 over exact source bytes, matching the P0 byte
//! contract fixtures.
//!
//! # Panic audit (P1A §4)
//!
//! Non-test code contains exactly two `.expect()` calls, both in
//! `position_map.rs` UTF-16 conversion, and both are provably infallible: every
//! loop step advances from a char boundary by `ch.len_utf8()` (never inside a
//! UTF-8 sequence), and the loop guard `byte < len` / `byte < offset` prevents
//! iterating past end-of-string, so `chars().next()` always yields a `char`.
//! All other panicking constructs live under `#[cfg(test)]`. There is no parser,
//! serializer, renderer or widget anywhere in this crate, so a clean save
//! payload can never come from one (task 2.7.1).

mod error;
mod identity;
mod line_ending;
mod patch;
mod position_map;
mod session;
mod snapshot;
mod text_buffer;
mod types;

pub use error::{CoreError, CoreResult, SourceOffsetError};
pub use identity::{ContentHash, FileIdentity};
pub use line_ending::{LineEndingKind, LineEndingMap, NewlineEnding};
pub use patch::{PatchOutcome, Selection, TextChange, TextPatch};
pub use position_map::PositionMap;
pub use session::{DocumentSnapshot, LosslessDocumentSession, SavePayload};
pub use snapshot::{BomKind, EncodingKind, OriginalSnapshot, UTF8_BOM};
pub use text_buffer::TextBuffer;
pub use types::{
    BindingGeneration, DocumentId, LogicalByteOffset, Revision, SessionId, SourceByteOffset,
    SourceRange, TransactionId, Utf16Offset,
};

/// Capacity of the idempotent-retry ledger.
pub use session::TRANSACTION_RETRY_WINDOW_CAPACITY;
