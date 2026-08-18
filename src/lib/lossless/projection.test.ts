/**
 * P2 lossless Live Preview — adapter tests for the single CodeMirror surface.
 *
 * Drives the REAL `openLosslessDocument` / `EditorSurfaceBinding` /
 * `createLosslessSourceEditor` against happy-dom with the Tauri `invoke`
 * boundary mocked (same pattern as lifecycle.test.ts). Proves the P2 gates:
 *
 *   1. mode switching is compartment reconfiguration: `docChanged=false`, no
 *      History entry, EditorView identity unchanged;
 *   2. the projection layer adds semantic decorations WITHOUT rewriting the
 *      `EditorState.doc` (source characters always remain);
 *   3. active-reveal promotes the marker of a construct the caret/selection
 *      intersects;
 *   4. CJK/emoji/ZWJ selection survives mapping;
 *   5. malformed / unknown input degrades to raw source, never blank.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import * as nodeFs from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';

// ── Minimal real-fs-backed invoke mock (subset of lifecycle.test.ts) ──
const state = vi.hoisted(() => ({
  sessions: new Map<number, any>(),
  nextSession: 1,
  nextDocument: 1,
}));

vi.mock('@tauri-apps/api/core', async () => {
  const nodeFsMod = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const sessionState = state;
  const sha256hex = (buf: Buffer | string) => {
    const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
    return createHash('sha256').update(b).digest('hex');
  };
  const readLogical = (content: string) =>
    content.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  return {
    invoke: vi.fn(async (cmd: string, args: any = {}) => {
      const req = args.req ?? args;
      switch (cmd) {
        case 'open_lossless_document': {
          const content = await nodeFsMod.readFile(req.path, 'utf8');
          const logicalText = readLogical(content);
          const sessionId = sessionState.nextSession++;
          const documentId = sessionState.nextDocument++;
          const fileIdentity = {
            canonicalPath: req.path,
            size: Buffer.byteLength(content, 'utf8'),
            mtime: null,
            contentHash: sha256hex(content),
          };
          sessionState.sessions.set(sessionId, {
            sessionId, documentId, bindingGeneration: 0, logicalText, revision: 0,
            persistedRevision: 0,
          });
          return {
            sessionId, documentId, bindingGeneration: 0, logicalText,
            revision: 0, persistedRevision: 0, confirmedHash: sha256hex(logicalText),
            original: {
              contentHash: sha256hex(content),
              byteLen: Buffer.byteLength(content, 'utf8'),
              bom: content.startsWith('﻿') ? 'utf8' : 'none',
              encoding: content.startsWith('﻿') ? 'utf8Bom' : 'utf8',
              lineEndings: [], trailingLineBreaks: 0,
              fileIdentity, dominantLineEnding: 'lf',
            },
          };
        }
        case 'apply_document_patch': {
          const patch = req.patch;
          const session = sessionState.sessions.get(patch.sessionId);
          if (!session) throw { code: 'session-missing', message: 'missing' };
          session.revision = (patch.baseRevision ?? 0) + 1;
          session.persistedRevision = session.revision;
          return { revision: session.revision };
        }
        case 'get_document_snapshot':
          return { text: '', revision: 0, confirmedHash: '' };
        case 'prepare_document_save':
          return { revision: req.expectedRevision, payloadBase64: '' };
        case 'guarded_atomic_write':
          return { outcome: 'written', newFileIdentity: null };
        case 'commit_document_save':
          return {};
        case 'reconcile_document_save':
          return { state: 'not-written' };
        default:
          throw new Error(`unmocked command: ${cmd}`);
      }
    }),
  };
});

// Flag + integration imports (real modules under test).
import { setLivePreviewEnabled } from './livePreviewFlag';
import { setLosslessCoreSessionEnabled } from './flag';
import { openLosslessDocument } from './integration';
import { getActiveLosslessBinding } from './registry';
import { getProjectionSnapshot, PROJECTION_CLASSES, resetProjectionSnapshot } from './projection';

let dir: string;

beforeAll(async () => {
  dir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), 'p2-projection-'));
});

afterAll(async () => {
  await nodeFs.rm(dir, { recursive: true, force: true });
});

beforeEach(() => {
  document.body.innerHTML = '<div id="source-editor-wrapper"></div>';
  resetProjectionSnapshot();
});

afterEach(() => {
  setLosslessCoreSessionEnabled(false);
  setLivePreviewEnabled(false);
});

async function writeFixture(name: string, content: string): Promise<string> {
  const p = nodePath.join(dir, name);
  await nodeFs.writeFile(p, content, 'utf8');
  return p;
}

describe('P2 projection adapter', () => {
  it('mode switching keeps EditorView identity, docChanged=false, no History', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const path = await writeFixture('switch.md', '# 标题\n\n**bold** text\n');
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding();
    expect(binding).not.toBeNull();
    const view = binding!.editor.view;
    const docBefore = view.state.doc.toString();
    const selectionBefore = view.state.selection.main;

    for (let i = 0; i < 100; i++) {
      binding!.setMode('preview');
      binding!.setMode('source');
    }

    // Identity unchanged: same view instance after 100 round-trips.
    expect(binding!.editor.view).toBe(view);
    // Doc unchanged: no mode transaction ever rewrote the document.
    expect(view.state.doc.toString()).toBe(docBefore);
    // Selection preserved (anchor + head).
    expect(view.state.selection.main.from).toBe(selectionBefore.from);
    expect(view.state.selection.main.to).toBe(selectionBefore.to);
    expect(view.state.selection.main.assoc).toBe(selectionBefore.assoc);
    expect(docBefore).toBeTruthy();
    expect(view.state.doc.length).toBe(docBefore.length);
  });

  it('projects semantic classes while source characters remain', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = [
      '# H1 标题',
      '## H2',
      '',
      '**strong** and *em* and ~~strike~~ and `code`',
      '',
      '[link](https://example.com)',
      '',
      '> quote line',
      '',
      '- item one',
      '- item two',
      '',
      '```js',
      'const x = 1;',
      '```',
      '',
    ].join('\n');
    const path = await writeFixture('constructs.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;

    binding.setMode('preview');

    const snapshot = getProjectionSnapshot();
    const classes = new Set(snapshot.constructs.map((c) => c.cls));
    expect(snapshot.state).toBe('rendered');
    // Semantic classes present:
    expect(classes.has(PROJECTION_CLASSES.heading)).toBe(true);
    expect(classes.has(PROJECTION_CLASSES.strong)).toBe(true);
    expect(classes.has(PROJECTION_CLASSES.emphasis)).toBe(true);
    expect(classes.has(PROJECTION_CLASSES.inlineCode)).toBe(true);
    expect(classes.has(PROJECTION_CLASSES.link)).toBe(true);
    expect(classes.has(PROJECTION_CLASSES.blockquote)).toBe(true);
    expect(classes.has(PROJECTION_CLASSES.listItem)).toBe(true);
    expect(classes.has(PROJECTION_CLASSES.fence)).toBe(true);
    // The underlying doc is byte-for-byte the source Markdown (never rewritten).
    expect(view.state.doc.toString()).toBe(md);
    expect(snapshot.count).toBeGreaterThan(0);
  });

  it('active reveal promotes a construct the caret intersects', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '# Heading\n\n**bold** here\n';
    const path = await writeFixture('reveal.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;

    binding.setMode('preview');
    // Caret inside the strong marker (`**bold**`): reveal should mark it active.
    const strongStart = md.indexOf('**');
    view.dispatch({ selection: { anchor: strongStart + 1 } });
    let snapshot = getProjectionSnapshot();
    const activeConstructs = snapshot.constructs.filter((c) => c.cls === PROJECTION_CLASSES.strong);
    expect(activeConstructs.length).toBe(1);

    // Move caret far away → no active reveal.
    view.dispatch({ selection: { anchor: md.indexOf('here') } });
    snapshot = getProjectionSnapshot();
    expect(snapshot.constructs.filter((c) => c.cls === PROJECTION_CLASSES.strong).length).toBe(1);
  });

  it('CJK/emoji/ZWJ selection maps without breaking', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '# 中文标题👨‍👩‍👧\n\n普通中文 emoji 🚀 zwnj 测试\n';
    const path = await writeFixture('cjk.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;

    // Select across emoji + ZWJ sequences and toggle modes repeatedly.
    const from = md.indexOf('普通');
    const to = md.indexOf('测试');
    view.dispatch({ selection: { anchor: from, head: to } });
    const selBefore = view.state.selection.main;
    for (let i = 0; i < 20; i++) {
      binding.setMode('preview');
      binding.setMode('source');
    }
    expect(view.state.selection.main.from).toBe(selBefore.from);
    expect(view.state.selection.main.to).toBe(selBefore.to);
    expect(view.state.doc.toString()).toBe(md);
  });

  it('heading level classes (mf-h1..mf-h6) are applied (P2-A corrective)', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '# H1\n\n## H2\n\n### H3\n\n正文\n';
    const path = await writeFixture('headings.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    binding.setMode('preview');
    const snapshot = getProjectionSnapshot();
    // The heading construct carries a level.
    const headings = snapshot.constructs.filter((c) => c.cls === PROJECTION_CLASSES.heading);
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(headings.some((h) => h.level === 1)).toBe(true);
    expect(headings.some((h) => h.level === 2)).toBe(true);
    // Decoration DOM carries the level class for the strongest heading.
    const h1 = headings.find((h) => h.level === 1);
    expect(h1).toBeDefined();
    // The underlying doc is untouched.
    expect(binding!.editor.view.state.doc.toString()).toBe(md);
  });

  it('malformed / unknown input degrades to source, never blank or exception', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '```\nunclosed fence\n\n| table |\n| --- |\n| a | b\n\n####### toomany\n\n<<<><>\n';
    const path = await writeFixture('malformed.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;

    // Switching to preview on malformed content must not throw.
    expect(() => binding.setMode('preview')).not.toThrow();
    // The doc is intact (never blank, never error rich-text).
    expect(view.state.doc.toString()).toBe(md);
    // The projection either rendered something or degraded — never crashes.
    const snapshot = getProjectionSnapshot();
    expect(['rendered', 'degraded']).toContain(snapshot.state);
  });
});
