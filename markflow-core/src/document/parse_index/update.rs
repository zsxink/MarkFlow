use super::list::starts_like_list_marker;
use super::types::{AffectedRanges, BlockKind, ParseIndex};
use crate::document::{ByteOffset, SourceRange, TextPatch};

pub(crate) const SYNC_REPARSE_CONTEXT_BYTES: usize = 16 * 1024;
pub(crate) const SYNC_REPARSE_BUDGET_BYTES: usize = 256 * 1024;

impl ParseIndex {
    pub fn update_after_patch(&mut self, patch: &TextPatch) -> AffectedRanges {
        let mut ranges = Vec::new();
        let mut requires_background_full_parse = false;
        for change in &patch.changes {
            let affected = self.affected_block_window(change.range.start.0, change.range.end.0);
            let (start, end, structure_sensitive) =
                affected.unwrap_or((change.range.start.0, change.range.end.0, false));
            let end = end.max(change.range.end.0.saturating_add(change.replacement.len()));
            let budgeted_end = end.saturating_add(SYNC_REPARSE_CONTEXT_BYTES);
            if budgeted_end.saturating_sub(start) > SYNC_REPARSE_BUDGET_BYTES
                || structure_sensitive
                || replacement_may_change_block_structure(&change.replacement)
            {
                requires_background_full_parse = true;
            }
            ranges.push(SourceRange {
                revision: patch.base_revision,
                start: ByteOffset(start),
                end: ByteOffset(budgeted_end),
            });
        }

        AffectedRanges {
            revision: patch.base_revision,
            stale_ranges: ranges,
            requires_background_full_parse,
            synchronous_budget_exhausted: requires_background_full_parse,
        }
    }

    fn affected_block_window(&self, start: usize, end: usize) -> Option<(usize, usize, bool)> {
        let mut affected_start = None::<usize>;
        let mut affected_end = None::<usize>;
        let mut structure_sensitive = false;

        for block in self
            .blocks
            .iter()
            .filter(|block| block.kind != BlockKind::Document)
        {
            let block_start = block.range.start.0;
            let block_end = block.range.end.0;
            let intersects = if start == end {
                block_start <= start && start <= block_end
            } else {
                block_start < end && start < block_end
            };
            if !intersects {
                continue;
            }

            affected_start =
                Some(affected_start.map_or(block_start, |current| current.min(block_start)));
            affected_end = Some(affected_end.map_or(block_end, |current| current.max(block_end)));
            structure_sensitive |= block.kind.requires_conservative_reparse();
        }

        Some((affected_start?, affected_end?, structure_sensitive))
    }
}

fn replacement_may_change_block_structure(replacement: &str) -> bool {
    replacement.lines().any(|line| {
        let trimmed = line.trim_start();
        trimmed.starts_with("<!--")
            || starts_with_fence_marker(trimmed, b'`')
            || starts_with_fence_marker(trimmed, b'~')
            || starts_like_list_marker(trimmed)
            || trimmed.starts_with('>')
            || trimmed.contains('|')
    })
}

fn starts_with_fence_marker(trimmed: &str, marker: u8) -> bool {
    trimmed
        .as_bytes()
        .iter()
        .take_while(|byte| **byte == marker)
        .count()
        >= 3
}
