use super::style_map::{PipePadding, TableAlignment};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TableScan {
    pub(crate) alignments: Vec<TableAlignment>,
    pub(crate) has_leading_pipe: bool,
    pub(crate) has_trailing_pipe: bool,
    pub(crate) delimiter_padding: Vec<PipePadding>,
}

pub(crate) fn parse_table_delimiter(line: &str) -> Option<TableScan> {
    let trimmed = line.trim();
    if !trimmed.contains('-') {
        return None;
    }

    let has_leading_pipe = trimmed.starts_with('|');
    let has_trailing_pipe = trimmed.ends_with('|');
    let cells = split_table_cells(trimmed);
    if cells.is_empty() {
        return None;
    }

    let mut alignments = Vec::new();
    let mut delimiter_padding = Vec::new();
    for cell in cells {
        let left = cell.starts_with(' ');
        let right = cell.ends_with(' ');
        let token = cell.trim();
        if token.len() < 3 {
            return None;
        }
        let bytes = token.as_bytes();
        let starts_colon = bytes.first() == Some(&b':');
        let ends_colon = bytes.last() == Some(&b':');
        let dash_start = usize::from(starts_colon);
        let dash_end = token.len().saturating_sub(usize::from(ends_colon));
        if dash_start >= dash_end
            || !token.as_bytes()[dash_start..dash_end]
                .iter()
                .all(|byte| *byte == b'-')
        {
            return None;
        }
        alignments.push(match (starts_colon, ends_colon) {
            (true, true) => TableAlignment::Center,
            (true, false) => TableAlignment::Left,
            (false, true) => TableAlignment::Right,
            (false, false) => TableAlignment::None,
        });
        delimiter_padding.push(PipePadding { left, right });
    }

    Some(TableScan {
        alignments,
        has_leading_pipe,
        has_trailing_pipe,
        delimiter_padding,
    })
}

pub(crate) fn split_table_cells(trimmed: &str) -> Vec<&str> {
    let without_leading = trimmed.strip_prefix('|').unwrap_or(trimmed);
    let without_outer = without_leading.strip_suffix('|').unwrap_or(without_leading);
    without_outer.split('|').collect()
}
