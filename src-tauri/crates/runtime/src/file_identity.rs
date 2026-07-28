use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Content fingerprint for quick identity comparison.
/// Uses the first N bytes or a fast hash prefix — not a full file hash.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContentFingerprint {
    /// Size of the sampled prefix (bytes).
    pub sample_size: u64,
    /// xxhash or sha256 prefix of the content sample.
    pub hash_prefix: String,
}

impl ContentFingerprint {
    /// Compute a fingerprint from content bytes.
    /// Uses a simple hash of the first 4096 bytes.
    pub fn compute(bytes: &[u8]) -> Self {
        let sample_size = bytes.len().min(4096) as u64;
        let sample = &bytes[..bytes.len().min(4096)];
        // Simple hash — suitable for collision detection, not cryptographic.
        let hash = xxhash_rust::xxh3::xxh3_64(sample);
        Self {
            sample_size,
            hash_prefix: format!("{:016x}", hash),
        }
    }

    /// Empty fingerprint for untitled/new documents.
    pub fn empty() -> Self {
        Self {
            sample_size: 0,
            hash_prefix: String::new(),
        }
    }
}

/// File identity for conflict detection.
///
/// Comparison rules:
/// - mtime/size is a fast pre-check, not conclusive.
/// - fingerprint is the final authority.
/// - If platform_id is available, use it as a cross-check.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileIdentity {
    /// Canonical filesystem path, if available.
    pub canonical_path: Option<PathBuf>,
    /// Platform-specific identifier (e.g. inode on Unix).
    pub platform_id: Option<String>,
    /// Last modification time in milliseconds since epoch.
    pub mtime_ms: Option<u64>,
    /// File size in bytes.
    pub size: u64,
    /// Content fingerprint (fast hash of first N bytes).
    pub fingerprint: ContentFingerprint,
}

impl FileIdentity {
    /// Create an empty identity for untitled documents or default initialization.
    pub fn empty() -> Self {
        Self {
            canonical_path: None,
            platform_id: None,
            mtime_ms: None,
            size: 0,
            fingerprint: ContentFingerprint::empty(),
        }
    }

    /// Create a FileIdentity from file metadata and content.
    pub fn from_metadata(path: &PathBuf, bytes: &[u8]) -> Self {
        let canonical_path = path.canonicalize().ok();
        let platform_id = std::fs::metadata(path).ok().and_then(|m| {
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                Some(m.ino().to_string())
            }
            #[cfg(not(unix))]
            {
                let _ = m;
                None
            }
        });

        let mtime_ms = std::fs::metadata(path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64);

        let size = bytes.len() as u64;
        let fingerprint = ContentFingerprint::compute(bytes);

        Self {
            canonical_path,
            platform_id,
            mtime_ms,
            size,
            fingerprint,
        }
    }

    /// Check if this identity matches another for conflict detection.
    /// Returns true if the file is unchanged (no conflict).
    pub fn matches(&self, other: &FileIdentity) -> bool {
        // Fast path: size must match
        if self.size != other.size {
            return false;
        }

        // Fingerprint is the final authority
        if self.fingerprint.hash_prefix.is_empty() || other.fingerprint.hash_prefix.is_empty() {
            // If either fingerprint is empty, fall back to mtime/size
            // (can happen for untitled docs or very small files)
            self.mtime_ms == other.mtime_ms
        } else {
            self.fingerprint == other.fingerprint
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_fingerprint_compute_returns_expected_hash() {
        let bytes = b"Hello, world! This is a test of the fingerprint computation.";
        let fp = ContentFingerprint::compute(bytes);
        assert!(
            !fp.hash_prefix.is_empty(),
            "hash_prefix should not be empty for non-empty input"
        );
        assert_eq!(
            fp.sample_size,
            bytes.len() as u64,
            "sample_size should match input length when under 4096"
        );
        // Verify deterministic: same input -> same hash
        let fp2 = ContentFingerprint::compute(bytes);
        assert_eq!(fp, fp2, "Same input should produce same fingerprint");
    }

    #[test]
    fn content_fingerprint_empty_has_no_hash() {
        let fp = ContentFingerprint::empty();
        assert!(
            fp.hash_prefix.is_empty(),
            "empty fingerprint should have empty hash_prefix"
        );
        assert_eq!(
            fp.sample_size, 0,
            "empty fingerprint should have sample_size 0"
        );
    }

    #[test]
    fn content_fingerprint_large_input_caps_at_4096() {
        let bytes = vec![0u8; 8192];
        let fp = ContentFingerprint::compute(&bytes);
        assert_eq!(
            fp.sample_size, 4096,
            "sample_size should be capped at 4096 for large inputs"
        );
    }

    #[test]
    fn file_identity_matches_same_identity_returns_true() {
        let identity = FileIdentity {
            canonical_path: Some(PathBuf::from("/tmp/test.md")),
            platform_id: Some("12345".into()),
            mtime_ms: Some(1000),
            size: 100,
            fingerprint: ContentFingerprint {
                sample_size: 100,
                hash_prefix: "abcdef".into(),
            },
        };
        assert!(identity.matches(&identity), "Identity should match itself");
        let clone = identity.clone();
        assert!(identity.matches(&clone), "Clone should match");
    }

    #[test]
    fn file_identity_matches_different_size_returns_false() {
        let a = FileIdentity {
            canonical_path: None,
            platform_id: None,
            mtime_ms: Some(1000),
            size: 100,
            fingerprint: ContentFingerprint {
                sample_size: 100,
                hash_prefix: "abcdef".into(),
            },
        };
        let b = FileIdentity {
            size: 200, // Different size
            ..a.clone()
        };
        assert!(!a.matches(&b), "Different sizes should not match");
    }

    #[test]
    fn file_identity_matches_empty_fingerprint_falls_back_to_mtime() {
        // When both fingerprints are empty, should fall back to mtime comparison
        let a = FileIdentity {
            canonical_path: None,
            platform_id: None,
            mtime_ms: Some(1000),
            size: 100,
            fingerprint: ContentFingerprint::empty(),
        };
        let b = FileIdentity {
            mtime_ms: Some(1000),
            fingerprint: ContentFingerprint::empty(),
            ..a.clone()
        };
        assert!(
            a.matches(&b),
            "Same mtime with empty fingerprints should match"
        );

        let c = FileIdentity {
            mtime_ms: Some(2000), // Different mtime
            fingerprint: ContentFingerprint::empty(),
            ..a.clone()
        };
        assert!(
            !a.matches(&c),
            "Different mtime with empty fingerprints should not match"
        );
    }

    #[test]
    fn file_identity_matches_fingerprint_overrides_mtime() {
        // When both have non-empty fingerprints, fingerprint comparison should be
        // the final authority even if mtime differs.
        let a = FileIdentity {
            canonical_path: None,
            platform_id: None,
            mtime_ms: Some(1000),
            size: 100,
            fingerprint: ContentFingerprint {
                sample_size: 100,
                hash_prefix: "abcdef".into(),
            },
        };
        let b = FileIdentity {
            mtime_ms: Some(9999), // Different mtime, but same fingerprint
            ..a.clone()
        };
        assert!(
            a.matches(&b),
            "Same fingerprint should match even with different mtime"
        );

        let c = FileIdentity {
            fingerprint: ContentFingerprint {
                sample_size: 100,
                hash_prefix: "different".into(), // Different fingerprint
            },
            ..a.clone()
        };
        assert!(
            !a.matches(&c),
            "Different fingerprint should not match even with same mtime"
        );
    }
}
