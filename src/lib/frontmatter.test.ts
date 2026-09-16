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
