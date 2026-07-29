use std::hash::Hasher;

use super::{CoreError, CoreResult, LineEndingKind};

const UTF8_BOM: &[u8] = &[0xEF, 0xBB, 0xBF];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BomKind {
    None,
    Utf8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EncodingKind {
    Utf8,
    Utf8Bom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ContentHash(pub u64);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OriginalSnapshot {
    bom: BomKind,
    encoding: EncodingKind,
    dominant_line_ending: LineEndingKind,
    trailing_newlines: usize,
    final_newline: bool,
    byte_len: usize,
    content_hash: ContentHash,
}

impl OriginalSnapshot {
    pub fn from_bytes(bytes: &[u8]) -> CoreResult<Self> {
        let (bom, content) = if bytes.starts_with(UTF8_BOM) {
            (BomKind::Utf8, &bytes[UTF8_BOM.len()..])
        } else {
            (BomKind::None, bytes)
        };

        let text = std::str::from_utf8(content).map_err(|_| CoreError::UnsupportedEncoding)?;
        let line_endings = scan_line_endings(text);
        let dominant_line_ending = dominant_line_ending(&line_endings);

        Ok(Self {
            bom,
            encoding: match bom {
                BomKind::None => EncodingKind::Utf8,
                BomKind::Utf8 => EncodingKind::Utf8Bom,
            },
            dominant_line_ending,
            trailing_newlines: count_trailing_newlines(text),
            final_newline: text.ends_with('\n') || text.ends_with('\r'),
            byte_len: bytes.len(),
            content_hash: ContentHash(fnv1a64(bytes)),
        })
    }

    pub fn bom(&self) -> BomKind {
        self.bom
    }

    pub fn encoding(&self) -> EncodingKind {
        self.encoding
    }

    pub fn dominant_line_ending(&self) -> LineEndingKind {
        self.dominant_line_ending
    }

    pub fn trailing_newlines(&self) -> usize {
        self.trailing_newlines
    }

    pub fn final_newline(&self) -> bool {
        self.final_newline
    }

    pub fn byte_len(&self) -> usize {
        self.byte_len
    }

    pub fn content_hash(&self) -> ContentHash {
        self.content_hash
    }
}

pub(crate) fn strip_bom(bytes: &[u8], bom: BomKind) -> &[u8] {
    match bom {
        BomKind::None => bytes,
        BomKind::Utf8 => &bytes[UTF8_BOM.len()..],
    }
}

pub(crate) fn push_bom(bytes: &mut Vec<u8>, bom: BomKind) {
    if bom == BomKind::Utf8 {
        bytes.extend_from_slice(UTF8_BOM);
    }
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hasher = Fnv1a64::default();
    hasher.write(bytes);
    hasher.finish()
}

#[derive(Default)]
struct Fnv1a64(u64);

impl Hasher for Fnv1a64 {
    fn finish(&self) -> u64 {
        if self.0 == 0 {
            0xcbf29ce484222325
        } else {
            self.0
        }
    }

    fn write(&mut self, bytes: &[u8]) {
        let mut hash = if self.0 == 0 {
            0xcbf29ce484222325
        } else {
            self.0
        };
        for byte in bytes {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x100000001b3);
        }
        self.0 = hash;
    }
}

fn scan_line_endings(text: &str) -> Vec<LineEndingKind> {
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\r' if bytes.get(i + 1) == Some(&b'\n') => {
                out.push(LineEndingKind::Crlf);
                i += 2;
            }
            b'\r' => {
                out.push(LineEndingKind::Cr);
                i += 1;
            }
            b'\n' => {
                out.push(LineEndingKind::Lf);
                i += 1;
            }
            _ => i += 1,
        }
    }
    out
}

fn dominant_line_ending(line_endings: &[LineEndingKind]) -> LineEndingKind {
    let (mut lf, mut crlf, mut cr) = (0, 0, 0);
    for kind in line_endings {
        match kind {
            LineEndingKind::Lf => lf += 1,
            LineEndingKind::Crlf => crlf += 1,
            LineEndingKind::Cr => cr += 1,
            LineEndingKind::Mixed => {}
        }
    }
    if lf == 0 && crlf == 0 && cr == 0 {
        return LineEndingKind::Lf;
    }
    if lf > 0 && crlf == 0 && cr == 0 {
        return LineEndingKind::Lf;
    }
    if crlf > 0 && lf == 0 && cr == 0 {
        return LineEndingKind::Crlf;
    }
    if cr > 0 && lf == 0 && crlf == 0 {
        return LineEndingKind::Cr;
    }
    LineEndingKind::Mixed
}

fn count_trailing_newlines(text: &str) -> usize {
    let bytes = text.as_bytes();
    let mut count = 0;
    let mut i = bytes.len();
    while i > 0 {
        if bytes[i - 1] == b'\n' {
            count += 1;
            i -= 1;
            if i > 0 && bytes[i - 1] == b'\r' {
                i -= 1;
            }
        } else if bytes[i - 1] == b'\r' {
            count += 1;
            i -= 1;
        } else {
            break;
        }
    }
    count
}
