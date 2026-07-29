use super::style_map::{BulletMarker, OrderedMarker};

#[derive(Debug, Clone, Copy)]
pub(crate) struct LineInfo<'a> {
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) text: &'a str,
}

impl<'a> LineInfo<'a> {
    pub(crate) fn trimmed(&self) -> &'a str {
        self.text.trim()
    }

    pub(crate) fn trimmed_start(&self) -> &'a str {
        self.text.trim_start()
    }

    pub(crate) fn is_blank(&self) -> bool {
        self.trimmed().is_empty()
    }
}

pub(crate) fn collect_lines(text: &str) -> Vec<LineInfo<'_>> {
    if text.is_empty() {
        return vec![LineInfo {
            start: 0,
            end: 0,
            text: "",
        }];
    }

    let mut lines = Vec::new();
    let mut start = 0;
    for (idx, byte) in text.as_bytes().iter().enumerate() {
        if *byte == b'\n' {
            lines.push(LineInfo {
                start,
                end: idx,
                text: &text[start..idx],
            });
            start = idx + 1;
        }
    }
    if start <= text.len() {
        lines.push(LineInfo {
            start,
            end: text.len(),
            text: &text[start..],
        });
    }
    lines
}

pub(crate) fn count_leading_spaces(text: &str) -> usize {
    text.as_bytes()
        .iter()
        .take_while(|byte| **byte == b' ')
        .count()
}

pub(crate) fn is_space(byte: u8) -> bool {
    byte == b' ' || byte == b'\t'
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ListMarker {
    pub(crate) indent: usize,
    pub(crate) bullet: Option<BulletMarker>,
    pub(crate) ordered: Option<OrderedMarker>,
    pub(crate) task: bool,
}
