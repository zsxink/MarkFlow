mod common;

use common::{change, open, patch};

#[test]
fn normalized_lf_replacement_inherits_crlf() {
    let mut session = open(b"one\r\ntwo\r\n");
    let insertion = session.text().logical_text().find("two").unwrap() + 1;
    let revision = session.revision();
    session
        .apply_patch(patch(
            revision,
            1,
            vec![change(revision, insertion, insertion, "X\nY")],
            None,
        ))
        .unwrap();

    assert_eq!(session.save_payload().as_bytes(), b"one\r\ntX\r\nYwo\r\n");
}

#[test]
fn mixed_eol_inheritance_preserves_untouched_boundaries() {
    let mut session = open(b"a\r\nb\nc\rd");
    let insertion = session.text().logical_text().find('b').unwrap() + 1;
    let revision = session.revision();
    session
        .apply_patch(patch(
            revision,
            2,
            vec![change(revision, insertion, insertion, "X\nY")],
            None,
        ))
        .unwrap();

    assert_eq!(session.save_payload().as_bytes(), b"a\r\nbX\nY\nc\rd");
}

#[test]
fn replacement_reuses_removed_eol_before_adjacent_style() {
    let mut session = open(b"a\r\nb\nc\r");
    let text = session.text().logical_text();
    let start = text.find('b').unwrap();
    let end = text.find('c').unwrap();
    let revision = session.revision();
    session
        .apply_patch(patch(
            revision,
            3,
            vec![change(revision, start, end, "B\nX\n")],
            None,
        ))
        .unwrap();

    assert_eq!(session.save_payload().as_bytes(), b"a\r\nB\nX\nc\r");
}

#[test]
fn explicit_crlf_and_cr_replacements_are_preserved() {
    let mut session = open(b"one\ntwo\n");
    let start = session.text().logical_text().find("two").unwrap();
    let end = start + 3;
    let revision = session.revision();
    session
        .apply_patch(patch(
            revision,
            4,
            vec![change(revision, start, end, "dos\r\nzwei\rtres")],
            None,
        ))
        .unwrap();

    assert_eq!(
        session.save_payload().as_bytes(),
        b"one\ndos\r\nzwei\rtres\n"
    );
}

#[test]
fn insertion_at_document_end_uses_left_eol_fallback() {
    let mut session = open(b"a\r\nb");
    let revision = session.revision();
    let end = session.text().len_bytes();
    session
        .apply_patch(patch(
            revision,
            5,
            vec![change(revision, end, end, "\nnext")],
            None,
        ))
        .unwrap();

    assert_eq!(session.save_payload().as_bytes(), b"a\r\nb\r\nnext");
}
