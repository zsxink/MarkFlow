// Spike probe: comrak node kinds + sourcepos for inline html / footnote ref / escapes.
use comrak::{parse_document, Arena, Options};

fn main() {
    let text = "Footnote[^1]\n\n[^1]: fn text\n\n<span>inline</span> after\n\nan escaped \\* star\n";
    let mut options = Options::default();
    options.extension.footnotes = true;
    let arena = Arena::new();
    let root = parse_document(&arena, text, &options);
    for d in root.descendants() {
        let ast = d.data.borrow();
        let sp = ast.sourcepos;
        let name = match &ast.value {
            comrak::nodes::NodeValue::Text(t) => format!("Text({:?})", t),
            v => format!("{:?}", std::mem::discriminant(v)).replace("Discriminant(", "").replace(")", ""),
        };
        let kind = match &ast.value {
            comrak::nodes::NodeValue::FootnoteReference(_) => "FootnoteRef",
            comrak::nodes::NodeValue::HtmlInline(h) => Box::leak(format!("HtmlInline({:?})", h).into_boxed_str()),
            comrak::nodes::NodeValue::Escaped => "Escaped",
            comrak::nodes::NodeValue::Text(_) => "Text",
            _ => "other",
        };
        println!("{:<12} sp=({},{}),({},{}) {:?}", kind, sp.start.line, sp.start.column, sp.end.line, sp.end.column, name);
    }
}
