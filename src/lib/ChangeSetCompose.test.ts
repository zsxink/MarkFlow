//! ChangeSet.compose regression test (Task M3.1-1.1)
//!
//! Demonstrates the `aXbYc` vs `aXYbc` problem using CodeMirror's own
//! ChangeSet objects. When two changes from different starting documents
//! are composed, the result must correctly reflect the sequence of changes.
//!
//! The bug: ChangeSet.compose works on the assumption that both changes
//! are relative to the same base document. When they're not (due to
//! optimistic mirror optimizations), the composed result can be wrong.
//!
//! This test verifies that composing two sequential changes produces the
//! correct final document.

import { describe, expect, it } from 'vitest';
import { ChangeSet, Text } from '@codemirror/state';

/**
 * Helper: create a Text document from a string.
 */
function doc(str: string): Text {
  return Text.of([str]);
}

/**
 * Apply a ChangeSet to a Text and return the resulting string.
 */
function apply(cs: ChangeSet, text: Text): string {
  return cs.apply(text).sliceString(0);
}

describe('ChangeSet.compose regression (M3.1-1.1)', () => {
  /**
   * Scenario: Start with document "abc", apply two changes:
   * 1. Insert "X" between "a" and "b" -> "aXbc"
   * 2. Insert "Y" between "b" and "c" -> "aXbYc"
   *
   * Verifies that ChangeSet.compose correctly composes two sequential
   * changes. After inserting "X" at position 1, the new document is
   * "aXbc" (length 4). Position 3 is between "b" and "c", so inserting
   * "Y" at position 3 gives "aXbYc".
   */
  it('composing two sequential inserts produces correct document (aXbYc)', () => {
    const startDoc = doc('abc');

    // First change: insert "X" between a and b (position 1) -> "aXbc"
    const change1 = ChangeSet.of([{ from: 1, to: 1, insert: 'X' }], startDoc.length);

    const doc1 = change1.apply(startDoc);
    expect(doc1.sliceString(0)).toBe('aXbc');
    expect(doc1.length).toBe(4);

    // Second change: insert "Y" between b and c (position 3 in "aXbc") -> "aXbYc"
    // Positions in "aXbc": a=0, X=1, b=2, c=3 — between b and c is position 3
    const doc1Text = doc(doc1.sliceString(0));
    const change2 = ChangeSet.of([{ from: 3, to: 3, insert: 'Y' }], doc1Text.length);

    // Sequential application
    const doc2 = change2.apply(doc1Text);
    expect(doc2.sliceString(0)).toBe('aXbYc');

    // Composition
    const composed = change1.compose(change2);
    const finalDoc = composed.apply(startDoc);

    // Composed should match sequential: "aXbYc"
    expect(finalDoc.sliceString(0)).toBe('aXbYc');
  });

  /**
   * Scenario: Start with document "hello", apply two changes:
   * 1. Delete "he" from start -> "llo"
   * 2. Insert "X" at position 1 -> "lXlo"
   *
   * The composed change should produce "lXlo" from "hello".
   */
  it('composing delete then insert produces correct document', () => {
    const startDoc = doc('hello');

    const change1 = ChangeSet.of([{ from: 0, to: 2, insert: '' }], startDoc.length);

    const doc1Str = apply(change1, startDoc);
    expect(doc1Str).toBe('llo');

    // Insert "X" at position 1 in the new document
    const doc1Text = doc(doc1Str);
    const change2 = ChangeSet.of([{ from: 1, to: 1, insert: 'X' }], doc1Text.length);

    const composed = change1.compose(change2);
    const finalDoc = composed.apply(startDoc);

    // After deleting "he", we have "llo". Inserting "X" at position 1 gives "lXlo"
    expect(finalDoc.sliceString(0)).toBe('lXlo');
  });

  /**
   * Scenario: Two changes to the same range should compose correctly.
   * 1. Replace "is" with "at" at position 5
   * 2. Replace "at" with "as" at the same position
   */
  it('composing two replacements at same position composes correctly', () => {
    const startDoc = doc('this is a test');

    const change1 = ChangeSet.of([{ from: 5, to: 7, insert: 'at' }], startDoc.length);
    expect(change1.apply(startDoc).sliceString(0)).toBe('this at a test');

    const doc1Str = apply(change1, startDoc);
    const doc1Text = doc(doc1Str);
    const change2 = ChangeSet.of([{ from: 5, to: 7, insert: 'as' }], doc1Text.length);

    const composed = change1.compose(change2);
    const finalDoc = composed.apply(startDoc);

    // "this is a test" -> "this at a test" (change1) -> "this as a test" (change2)
    expect(finalDoc.sliceString(0)).toBe('this as a test');
  });

  /**
   * Scenario: Starting from "abc", two sequential changes:
   * 1. Insert "X" between a-b -> "aXbc"
   * 2. Insert "Y" between b-c -> "aXbYc"
   *
   * Verifies that compose is correct for properly-ordered changes.
   * In "aXbc" (length 4), between b and c is position 3.
   * ChangeSet.compose correctly maps position 3 back to position 2
   * in "abc", producing "aXbYc" from the composed change.
   */
  it('compose works correctly with properly ordered changes (aXbYc)', () => {
    const startDoc = doc('abc');

    const c1 = ChangeSet.of([{ from: 1, to: 1, insert: 'X' }], startDoc.length);
    const doc1Str = apply(c1, startDoc);
    const doc1Text = doc(doc1Str);
    // In "aXbc" (a=0, X=1, b=2, c=3), between b and c is position 3
    const c2 = ChangeSet.of([{ from: 3, to: 3, insert: 'Y' }], doc1Text.length);
    const doc2Str = apply(c2, doc1Text);

    const composed = c1.compose(c2);
    const composedDoc = composed.apply(startDoc);

    expect(doc2Str).toBe('aXbYc');
    expect(composedDoc.sliceString(0)).toBe('aXbYc');
    expect(composedDoc.sliceString(0)).toBe(doc2Str);
  });

  /**
   * Verify that composing an empty change with a real change
   * produces the same result as just the real change.
   */
  it('composing with empty change is identity', () => {
    const startDoc = doc('hello world');

    const emptyChange = ChangeSet.of([], startDoc.length);
    const realChange = ChangeSet.of([{ from: 6, to: 11, insert: 'there' }], startDoc.length);

    const composed = emptyChange.compose(realChange);
    const finalDoc = composed.apply(startDoc);

    expect(finalDoc.sliceString(0)).toBe('hello there');
  });
});
