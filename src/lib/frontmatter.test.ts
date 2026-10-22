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
  it('preserves quoted key tokens when editing scalar and array values', () => {
    const source = '\uFEFF---\r\n# Keep this note\r\n"a:b": old\r\n"tag:key":\r\n- one\r\n- two\r\n---\r\n\r\n# Body\r\nuntouched  \r\n';
    const scalar = patchFrontmatterField(source, 'a:b', 'new', 'text')!;
    expect(scalar).toBe(source.replace('"a:b": old', '"a:b": new'));
    const array = patchFrontmatterField(source, 'tag:key', ['three'], 'array')!;
    expect(array).toBe(source.replace('- one\r\n- two', '- three'));
    expect(analyzeFrontmatter(scalar).supported).toBe(true);
    expect(analyzeFrontmatter(array).supported).toBe(true);
  });

  it('renames quoted keys safely and treats new names as literal text', () => {
    const source = '---\n"a:b": value\nother: keep\n---\nBody';
    expect(renameFrontmatterField(source, 'a:b', 'name')).toBe('---\nname: value\nother: keep\n---\nBody');
    expect(renameFrontmatterField(source, 'a:b', 'other')).toBeNull();
    const renamed = renameFrontmatterField(source, 'a:b', 'a"b:c')!;
    const result = analyzeFrontmatter(renamed);
    expect(result.supported && result.fields[0].key).toBe('a"b:c');
    expect(renamed).toContain('other: keep\n---\nBody');
    expect(addFrontmatterField(source, 'a:b', 'x', 'text')).toBeNull();
    const added = analyzeFrontmatter(addFrontmatterField(source, 'new:key', 'x', 'text')!);
    expect(added.supported && added.fields[added.fields.length - 1]?.key).toBe('new:key');
  });

  it('decodes quoted keys even when they contain no colon', () => {
    const source = `---\n'a" onfocus="attack': value\n---\nBody`;
    const result = analyzeFrontmatter(source);
    expect(result.supported && result.fields[0].key).toBe('a" onfocus="attack');
    expect(patchFrontmatterField(source, 'a" onfocus="attack', 'safe', 'text')).toBe(source.replace(': value', ': safe'));
  });

  it('keeps numeric and boolean arrays typed when editing', () => {
    for (const [yaml, value, expected] of [
      ['items: [1, 2]', [3, 4], 'items: [3, 4]'],
      ['items:\n- true\n- false', [false, true], 'items:\n- false\n- true'],
    ] as const) {
      const source = `---\n${yaml}\n---\nBody`;
      const changed = patchFrontmatterField(source, 'items', [...value] as number[] | boolean[], 'array')!;
      expect(changed).toBe(`---\n${expected}\n---\nBody`);
      const result = analyzeFrontmatter(changed);
      expect(result.supported && result.fields[0].value).toEqual(value);
    }
  });

  it('keeps an emptied block list editable as an empty flow array', () => {
    const source = '---\ntags:\n- last\nauthor: Me\n---\nBody';
    const changed = patchFrontmatterField(source, 'tags', [], 'array')!;
    expect(changed).toBe('---\ntags: []\nauthor: Me\n---\nBody');
    const result = analyzeFrontmatter(changed);
    expect(result.supported && result.fields[0].value).toEqual([]);
  });

  it('round-trips YAML-sensitive tag text without treating quoted hashes as comments', () => {
    for (const source of ['---\ntags: [old]\n---\nBody', '---\ntags:\n- old\n---\nBody']) {
      const tags = ['C#', 'a,b', 'a"b', '&tools'];
      const changed = patchFrontmatterField(source, 'tags', tags, 'array')!;
      const result = analyzeFrontmatter(changed);
      expect(result.supported && result.fields[0].value).toEqual(tags);
      expect(changed.endsWith('---\nBody')).toBe(true);
      expect(() => patchFrontmatterField(source, 'tags', [''], 'array')).toThrow();
    }
    for (const array of ['[&x one, *x]', '[!!str one]', '[one, # comment]']) {
      expect(analyzeFrontmatter(`---\ntags: ${array}\n---\nBody`).supported).toBe(false);
    }
  });

  it('rejects invalid dates, non-finite numbers and mismatched array item types', () => {
    const source = '---\ndate: 2024-02-29\ncount: 1\nitems: [true, false]\n---\nBody';
    expect(() => patchFrontmatterField(source, 'date', '2024-02-30', 'date')).toThrow();
    expect(() => patchFrontmatterField(source, 'count', NaN, 'number')).toThrow();
    expect(() => patchFrontmatterField(source, 'items', ['true'], 'array')).toThrow();
    const decimal = patchFrontmatterField(source, 'count', 0.0000001, 'number')!;
    const result = analyzeFrontmatter(decimal);
    expect(result.supported && result.fields[1].kind).toBe('number');
    expect(result.supported && result.fields[1].value).toBe(0.0000001);
  });

  it('falls back for non-finite YAML array literals instead of exposing number controls', () => {
    for (const number of ['.inf', '-.inf', '.nan', '1e999']) {
      expect(analyzeFrontmatter(`---\ncounts: [${number}, 2]\n---\nBody`).supported).toBe(false);
    }
  });

  it('retains date-looking text as text and allows date-to-text conversion', () => {
    const source = '---\npublished: 2026-10-23\n---\nBody';
    const text = patchFrontmatterField(source, 'published', '2026-10-23', 'text')!;
    expect(text).toBe('---\npublished: "2026-10-23"\n---\nBody');
    const analysis = analyzeFrontmatter(text);
    expect(analysis.supported && analysis.fields[0].kind).toBe('text');
    expect(patchFrontmatterField(text, 'published', '2026-10-23', 'date')).toBe(source);
  });

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
