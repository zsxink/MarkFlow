// Shared types + coordinate conversion for the P4A parser spike (Rust side).
//
// Candidate parsers report byte offsets (markdown-rs, pulldown-cmark) or
// 1-based line/byte-column (comrak) in their NATIVE coordinates. Everything is
// converted to UTF-16 code unit offsets on the logical LF text so the reports
// are directly comparable with the TypeScript (Lezer) candidate.

pub type RangeU = (usize, usize); // half-open [start, end) in UTF-16 code units

#[derive(Debug, Clone, serde::Serialize)]
pub struct SpikeConstruct {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    pub sourceRange: RangeU,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contentRange: Option<RangeU>,
    pub markerRanges: Vec<RangeU>,
}

/// Bidirectional byte <-> UTF-16 code unit map for one logical text.
pub struct CoordMap {
    byte_to_u16: Vec<u32>,
    u16_to_byte: Vec<u32>,
}

impl CoordMap {
    pub fn build(text: &str) -> Self {
        let mut byte_to_u16 = Vec::with_capacity(text.len() + 1);
        let mut u16_to_byte: Vec<u32> = Vec::new();
        let mut u: u32 = 0;
        for ch in text.chars() {
            let start_byte = byte_to_u16.len() as u32;
            let u16_len = ch.len_utf16() as u32;
            for _ in 0..ch.len_utf8() {
                byte_to_u16.push(u);
            }
            // every UTF-16 unit of the char maps back to the char's start byte
            for _ in 0..u16_len {
                u16_to_byte.push(start_byte);
            }
            u += u16_len;
        }
        byte_to_u16.push(u);
        // one-past-the-end u16 index maps to the total BYTE length
        u16_to_byte.push(text.len() as u32);
        Self { byte_to_u16, u16_to_byte }
    }

    /// byte offset -> UTF-16 code unit offset.
    pub fn b2u(&self, b: usize) -> usize {
        self.byte_to_u16.get(b).copied().unwrap_or(*self.byte_to_u16.last().unwrap_or(&0)) as usize
    }

    /// UTF-16 code unit offset -> byte offset (clamped to char boundaries).
    pub fn u2b(&self, u: usize) -> usize {
        self.u16_to_byte.get(u).copied().unwrap_or(*self.u16_to_byte.last().unwrap_or(&0)) as usize
    }

    pub fn convert(&self, r: (usize, usize)) -> RangeU {
        (self.b2u(r.0), self.b2u(r.1))
    }

    /// UTF-16 offset -> Rust string slice (byte indices for `text.get`).
    pub fn u16_slice(&self, text: &str, r: RangeU) -> (usize, usize) {
        (self.u2b(r.0), self.u2b(r.1))
    }
}

/// source bytes -> logical LF text (UTF-8). Strips a UTF-8 BOM, normalizes
/// CRLF/CR to LF — byte-for-byte the same rule as the TS fixture loader.
pub fn to_logical_text(bytes: &[u8], bom: &str) -> String {
    let mut s = String::from_utf8_lossy(bytes).into_owned();
    if bom == "utf8" && s.starts_with('\u{FEFF}') {
        s = s[3..].to_string(); // BOM is 3 UTF-8 bytes
    }
    s.replace("\r\n", "\n").replace('\r', "\n")
}
