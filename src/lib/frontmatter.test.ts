import { describe, expect, it } from 'vitest';
import { addFrontmatterField, analyzeFrontmatter, createEmptyFrontmatter, extractFrontmatter, patchFrontmatterField, removeFrontmatterField, renameFrontmatterField, reorderFrontmatterField } from './frontmatter';

describe('frontmatter domain', () => {
  it('extracts BOM and CRLF complete leading frontmatter only', () => {
    const source = '\uFEFF---\r\ntitle: Hello\r\n---\r\n# Body';
    expect(extractFrontmatter(source)?.yaml).toBe('title: Hello\r\n');
    expect(extractFrontmatter('---\ntitle: no close')).toBeNull();
    expect(extractFrontmatter('# body')).toBeNull();
  });
  it('classifies deterministic scalar types and rejects complex values', () => {
    const result = analyzeFrontmatter('---\na: "true"\nb: true\nc: 2024-02-29\nd: 1.2\n---\n');
    expect(result.supported && result.fields.map(x => x.kind)).toEqual(['text', 'boolean', 'date', 'number']);
    expect(analyzeFrontmatter('---\na:\n  b: c\n---\n').supported).toBe(false);
    expect(analyzeFrontmatter('---\na: [1, true]\n---\n').supported).toBe(false);
  });
  it('patches only the intended field and preserves surrounding bytes', () => {
    const source = '---\n# note\ntitle: "Old"\nblank: keep\n---\nBody';
    const edited = patchFrontmatterField(source, 'title', 'New', 'text');
    expect(edited).toContain('# note\ntitle: New\nblank: keep');
    expect(removeFrontmatterField(edited!, 'blank')).toContain('# note\ntitle: New');
    expect(addFrontmatterField(edited!, 'draft', true, 'boolean')).toContain('draft: true');
    expect(addFrontmatterField(edited!, 'authors', ['张三', '李四'], 'array')).toContain('authors: [张三, 李四]');
    expect(reorderFrontmatterField('---\na: one\nb: two\n---\n', 'b', 0)).toBe('---\nb: two\na: one\n---\n');
  });
  it('preserves flow and block array presentation while rejecting unsafe arrays', () => {
    const flow = '---\ntags: ["甲", "乙"]\n---\n';
    expect(patchFrontmatterField(flow, 'tags', ['甲', '丙'], 'array')).toContain('tags: [甲, 丙]');
    const block = '---\ntags:\n- one\n- two\n---\n';
    expect(patchFrontmatterField(block, 'tags', ['one', 'three'], 'array')).toContain('tags:\n- one\n- three\n');
    expect(analyzeFrontmatter('---\ntags: [one, # note]\n---\n').supported).toBe(false);
  });
  it('renames scalar and block-array keys without changing their values', () => {
    expect(renameFrontmatterField('---\ntitle: Hello\n---\n', 'title', 'name')).toBe('---\nname: Hello\n---\n');
    expect(renameFrontmatterField('---\ntags:\n- one\n- two\n---\n', 'tags', 'labels')).toBe('---\nlabels:\n- one\n- two\n---\n');
    expect(renameFrontmatterField('---\ntitle: Hello\nauthor: Me\n---\n', 'title', 'author')).toBeNull();
    expect(renameFrontmatterField('---\ntitle: Hello\n---\n', 'title', '')).toBeNull();
  });
  it('creates a complete frontmatter block preserving BOM and EOL', () => expect(createEmptyFrontmatter('\uFEFF# body\r\n')).toBe('\uFEFF---\r\n---\r\n\r\n# body\r\n'));
});

describe('frontmatter serialization safety (review fixes)', () => {
  it('quotes text values that YAML re-resolves to a different scalar', () => {
    // 00 \u2192 0, +5 \u2192 5, 0x1F \u2192 31 \u2026 would silently change the stored value.
    for (const star of ['00', '01', '+5', '.5', '5.', '1e3', '0o17', '0x1F']) {
      const patched = patchFrontmatterField('---\na: b\n---\n', 'a', star, 'text');
      expect(patched).toBe(`---\na: "${star}"\n---\n`);
    }
  });
  it('leaves ordinary text values unquoted for readability', () => {
    expect(patchFrontmatterField('---\na: b\n---\n', 'a', 'hello', 'text')).toBe('---\na: hello\n---\n');
    expect(patchFrontmatterField('---\ntags: [x]\n---\n', 'tags', ['no', 'yes'], 'array')).toBe('---\ntags: [no, yes]\n---\n');
  });
  it('patches a value whose key shares a substring with it (a c: c)', () => {
    expect(patchFrontmatterField('---\na c: c\n---\n', 'a c', 'x', 'text')).toBe('---\na c: x\n---\n');
  });
  it('does not split quoted commas inside flow-array elements', () => {
    const analysis = analyzeFrontmatter('---\ntags: ["a,b", "c", d]\n---\n');
    expect(analysis.supported).toBe(true);
    if (analysis.supported) expect(analysis.fields[0].value).toEqual(['a,b', 'c', 'd']);
  });
  it('round-trips a flow array that contains a quoted comma', () => {
    expect(patchFrontmatterField('---\ntags: ["a,b", "c"]\n---\n', 'tags', ['a,b', 'd'], 'array')).toBe('---\ntags: ["a,b", d]\n---\n');
  });
  it('collapses a block array to a scalar without swallowing following entries', () => {
    const patched = patchFrontmatterField('---\ntags:\n- one\n- two\nauthor: Me\n---\n', 'tags', 'one, two', 'text');
    expect(patched).toBe('---\ntags: "one, two"\nauthor: Me\n---\n');
    expect(analyzeFrontmatter(patched!).supported).toBe(true);
  });
  it('parses quoted keys that contain a colon ("a:b": v)', () => {
    const analysis = analyzeFrontmatter('---\n"a:b": v\n---\n');
    expect(analysis.supported).toBe(true);
    if (analysis.supported) expect(analysis.fields[0].key).toBe('a:b');
  });
  it('keeps mixing an array kind a scalar typing consistent', () => {
    // scalar \u2192 flow array and back must stay analyzable
    const toArr = patchFrontmatterField('---\na: b\n---\n', 'a', ['x', 'y'], 'array');
    expect(toArr).toBe('---\na: [x, y]\n---\n');
    expect(analyzeFrontmatter(toArr!).supported).toBe(true);
  });
});
