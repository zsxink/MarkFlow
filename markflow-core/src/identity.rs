//! Content hashing and file identity.
//!
//! Content hashes are SHA-256 over the exact source bytes, matching the P0
//! canonical fixture manifest and the byte-contract harness. The draft used a
//! 64-bit FNV for compactness; P1A deliberately uses SHA-256 so every L0/L1
//! report can compare `input_sha256 == saved_sha256` directly.

use std::fmt;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// SHA-256 of a byte sequence.
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ContentHash([u8; 32]);

impl ContentHash {
    /// Compute the SHA-256 of `bytes`.
    pub fn of(bytes: &[u8]) -> Self {
        let digest = Sha256::digest(bytes);
        let mut out = [0u8; 32];
        out.copy_from_slice(&digest);
        ContentHash(out)
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// Lowercase hex representation, matching the byte-contract manifest.
    pub fn hex(&self) -> String {
        let mut s = String::with_capacity(64);
        for b in self.0 {
            s.push_str(&format!("{b:02x}"));
        }
        s
    }
}

impl fmt::Debug for ContentHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ContentHash({})", &self.hex()[..16])
    }
}

impl fmt::Display for ContentHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.hex())
    }
}

impl Serialize for ContentHash {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.hex())
    }
}

impl<'de> Deserialize<'de> for ContentHash {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        if s.len() != 64 {
            return Err(serde::de::Error::custom(
                "content hash must be 64 hex chars",
            ));
        }
        let mut out = [0u8; 32];
        for (i, pair) in s.as_bytes().chunks(2).enumerate() {
            let hi = hex_val(pair[0]).ok_or_else(|| serde::de::Error::custom("bad hex"))?;
            let lo = hex_val(pair[1]).ok_or_else(|| serde::de::Error::custom("bad hex"))?;
            out[i] = (hi << 4) | lo;
        }
        Ok(ContentHash(out))
    }
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Identity of the file on disk. In P1A the Core performs no I/O; the caller
/// records this at open (from `read_file`) and passes it back to
/// [`crate::session::LosslessDocumentSession::prepare_save`] so a save with a
/// stale/mismatched disk identity is rejected instead of overwriting an
/// externally-changed file (design 04 §1, §4).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIdentity {
    pub canonical_path: Option<PathBuf>,
    pub size: u64,
    pub mtime: Option<i64>,
    pub content_hash: ContentHash,
}

impl FileIdentity {
    /// Headless identity for bytes without a real disk path (used by tests and
    /// the P1B registry when the path is not yet known).
    pub fn from_bytes(bytes: &[u8]) -> Self {
        Self {
            canonical_path: None,
            size: bytes.len() as u64,
            mtime: None,
            content_hash: ContentHash::of(bytes),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_matches_empty_and_known_vector() {
        // SHA-256 of empty input.
        assert_eq!(
            ContentHash::of(b"").hex(),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        // SHA-256 of "abc".
        assert_eq!(
            ContentHash::of(b"abc").hex(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn serde_round_trip_as_hex() {
        let h = ContentHash::of(b"hello world");
        let json = serde_json::to_string(&h).unwrap();
        assert!(json.starts_with('"'));
        let back: ContentHash = serde_json::from_str(&json).unwrap();
        assert_eq!(h, back);
    }

    #[test]
    fn identity_from_bytes() {
        let id = FileIdentity::from_bytes(b"data");
        assert_eq!(id.size, 4);
        assert_eq!(id.content_hash, ContentHash::of(b"data"));
        assert!(id.canonical_path.is_none());
    }
}
