//! Magic-byte sniffing for downloaded images.
//!
//! A declared `Content-Type` is attacker-controlled, so the first bytes are
//! checked against the known image signatures before anything is written.

/// The first bytes of known image formats (up to 8 bytes each).
const MAGIC_PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
const MAGIC_JPEG: &[u8] = &[0xFF, 0xD8, 0xFF];
const MAGIC_GIF: &[u8] = b"GIF8";
const MAGIC_WEBP: &[u8] = b"RIFF";
const MAGIC_BMP: &[u8] = b"BM";

/// Check the first `buf` bytes against known image magic bytes.
/// Returns `true` if the content *could* be the image type declared by the
/// Content-Type header (i.e. the magic matches at least one known format).
///
/// SVG is accepted here — SVG files start with `<?xml` or `<svg` which are
/// checked as valid XML/image prefixes.
pub fn validate_image_magic(buf: &[u8]) -> bool {
    if buf.len() < 4 {
        return false;
    }
    if buf.starts_with(MAGIC_PNG) {
        return true;
    }
    if buf.starts_with(MAGIC_JPEG) {
        return true;
    }
    if buf.starts_with(MAGIC_GIF) {
        return true;
    }
    // WebP: check RIFF....WEBP — the "WEBP" signature appears at offset 8
    if buf.len() >= 12 && buf.starts_with(MAGIC_WEBP) && &buf[8..12] == b"WEBP" {
        return true;
    }
    if buf.starts_with(MAGIC_BMP) {
        return true;
    }
    // SVG: starts with <?xml or <svg (case-insensitive for <SVG)
    if buf.starts_with(b"<?xml") || buf.starts_with(b"<svg") || buf.starts_with(b"<SVG") {
        return true;
    }
    false
}
