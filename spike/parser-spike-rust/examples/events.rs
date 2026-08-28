// Spike probe: dump raw pulldown-cmark event ranges for a small text.
use pulldown_cmark::{Options, Parser};

fn main() {
    let text = "# Title\n\n- item one\n- [x] task two\n\na **b *i* c** d\n`code` and ~~s~~\n[text](url) and <https://e.com>\n\n> quote\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nFootnote[^1]\n\n[^1]: fn text\n";
    let opts = Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_FOOTNOTES;
    for (ev, range) in Parser::new_ext(text, opts).into_offset_iter() {
        let slice = &text[range.clone()];
        println!("{:>3}..{:<3} {:?} {:?}", range.start, range.end, ev, slice);
    }
}
