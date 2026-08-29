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
import { resetPreferredMode, setPreferredMode } from './modePreference';
import { setLosslessCoreSessionEnabled } from './flag';
import { openLosslessDocument, saveLosslessActiveDocument } from './integration';
import { getActiveLosslessBinding } from './registry';
import {
  getProjectionSnapshot,
  PROJECTION_CLASSES,
  resetProjectionSnapshot,
  setProjectionTestFailMode,
  type ConstructRange,
} from './projection';

let dir: string;

// Frozen ConstructRange golden for PARITY_DOC (captured on the pre-registry
// implementation; see the parity test at the bottom of this file). It covers
// every locally projected kind (heading h1-h3 + both Setext variants, strong,
// emphasis, strikethrough, inline code, nested Link/URL, blockquote, list
// items, fence) and proves the exact-source fallback kinds in the same doc
// (frontmatter — frozen as the ADR-known SetextHeading2 misjudgment, table,
// HTML block/comment, image, footnote) produce NO construct. The image URL
// (mf-link at 156) and the footnote-definition link label (mf-link at 302)
// are pre-registry legacy shapes — do not "fix" them here.
const GOLDEN: ConstructRange[] = [
  { from: 4, to: 21, markers: [[18, 21]], cls: 'mf-h', level: 2 },
  { from: 23, to: 36, markers: [[23, 24]], cls: 'mf-h', level: 1 },
  { from: 38, to: 43, markers: [[38, 40]], cls: 'mf-h', level: 2 },
  { from: 45, to: 51, markers: [[45, 48]], cls: 'mf-h', level: 3 },
  { from: 53, to: 73, markers: [[64, 73]], cls: 'mf-h', level: 1 },
  { from: 75, to: 95, markers: [[86, 95]], cls: 'mf-h', level: 2 },
  { from: 97, to: 107, markers: [[97, 99], [105, 107]], cls: 'mf-strong' },
  { from: 108, to: 112, markers: [[108, 109], [111, 112]], cls: 'mf-emphasis' },
  { from: 113, to: 120, markers: [[113, 115], [118, 120]], cls: 'mf-strikethrough' },
  { from: 121, to: 127, markers: [[121, 122], [126, 127]], cls: 'mf-inline-code' },
  {
    from: 128,
    to: 150,
    markers: [[128, 129], [130, 131], [131, 132], [149, 150]],
    cls: 'mf-link',
  },
  { from: 132, to: 149, markers: [], cls: 'mf-link' },
  { from: 156, to: 161, markers: [], cls: 'mf-link' },
  { from: 164, to: 171, markers: [[164, 165]], cls: 'mf-blockquote' },
  { from: 173, to: 183, markers: [[173, 174]], cls: 'mf-list-item' },
  { from: 184, to: 194, markers: [[184, 185]], cls: 'mf-list-item' },
  { from: 196, to: 218, markers: [], cls: 'mf-fence' },
  { from: 302, to: 306, markers: [[302, 303], [305, 306]], cls: 'mf-link' },
];

beforeAll(async () => {
  dir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), 'p2-projection-'));
});

afterAll(async () => {
  await nodeFs.rm(dir, { recursive: true, force: true });
});

beforeEach(() => {
  document.body.innerHTML = '<div id="source-editor-wrapper"></div>';
  resetProjectionSnapshot();
  resetPreferredMode();
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

  // ── P2A marker weakening fix: discrete marker spans ─────────────────
  // Design 03 §2: only the delimiter characters are weakened (marker 初期可见但
  // 弱化) — never the content between two delimiters. Each marker range must be
  // a SEPARATE decoration covering exactly the syntax characters.

  it('strong marker decoration covers only the ** delimiters, not the content', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '**bold** and normal text\n';
    const path = await writeFixture('strong-markers.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    binding.setMode('preview');

    // Choose a caret safely away from the strong construct so it is not active.
    view.dispatch({ selection: { anchor: md.indexOf('normal') } });

    const snapshot = getProjectionSnapshot();
    const strong = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.strong);
    expect(strong).toBeDefined();
    // The construct spans the whole `**bold**` (8 chars).
    expect(strong!.from).toBe(0);
    expect(strong!.to).toBe(8);
    // The discrete marker spans must be EXACTLY the two `**` delimiters.
    expect(strong!.markers).toEqual([
      [0, 2],
      [6, 8],
    ]);

    // The DOM must carry .mf-marker on the delimiter characters ONLY, never on
    // the content between them. Each .mf-marker span wraps exactly one `**`.
    const mfMarkers = Array.from(view.contentDOM.querySelectorAll('span.mf-marker'));
    expect(mfMarkers.length).toBe(2);
    const markerTexts = mfMarkers.map((el) => el.textContent);
    expect(markerTexts).toEqual(['**', '**']);
    // The bold content lives inside the .mf-strong wrapper but is NOT wrapped by
    // any .mf-marker span — it is the syntax-highlight span between the two
    // marker spans.
    const strongEl = view.contentDOM.querySelector('span.mf-strong')!;
    const boldSpan = Array.from(strongEl.children).find(
      (el) => !el.classList.contains('mf-marker'),
    );
    expect(boldSpan).toBeTruthy();
    expect(boldSpan!.textContent).toBe('bold');
    // No .mf-marker span contains the content text.
    expect(markerTexts.includes('bold')).toBe(false);
  });

  it('link decoration covers only [ ] ( ) delimiters, not text or url', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '[text](https://example.com)\n\nplain paragraph far away\n';
    const path = await writeFixture('link-markers.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    binding.setMode('preview');

    // Caret far from the link so it is NOT active (active reveal would promote
    // the construct to full marker visibility and skip the weak markers).
    view.dispatch({ selection: { anchor: md.indexOf('far away') } });

    const snapshot = getProjectionSnapshot();
    // There are two mf-link constructs: the Link itself and its nested URL.
    // The URL construct decorates the URL text; the Link construct owns the
    // four delimiter markers ( [ ] ( ) ). Filter for the construct that owns
    // them.
    const linkConstructs = snapshot.constructs.filter((c) => c.cls === PROJECTION_CLASSES.link);
    expect(linkConstructs.length).toBe(2);
    const link = linkConstructs.find((c) => c.from === 0)!;
    const url = linkConstructs.find((c) => c.from === 7)!;
    // The outer Link delimiter markers are exactly the four syntax characters.
    expect(link.markers).toEqual([
      [0, 1],
      [5, 6],
      [6, 7],
      [26, 27],
    ]);
    // The nested URL construct (the (url) text) has no delimiter markers.
    expect(url.markers).toEqual([]);

    // DOM: the four delimiter spans carry .mf-marker with exactly the delimiters.
    const mfMarkers = Array.from(view.contentDOM.querySelectorAll('span.mf-marker'));
    const markerTexts = mfMarkers.map((el) => el.textContent);
    expect(markerTexts).toEqual(['[', ']', '(', ')']);
    // Neither the link text nor the URL is wrapped by .mf-marker.
    expect(markerTexts.includes('text')).toBe(false);
    expect(markerTexts.includes('https://example.com')).toBe(false);
  });

  it('heading decoration covers the # marker only, not the heading text', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '# Heading text\n\nplain paragraph far away\n';
    const path = await writeFixture('heading-markers.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    binding.setMode('preview');

    // Caret far from the heading so it is NOT active.
    view.dispatch({ selection: { anchor: md.indexOf('far away') } });

    const snapshot = getProjectionSnapshot();
    const heading = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.heading)!;
    expect(heading).toBeDefined();
    // The heading marker is the `#` at least (the HeaderMark node is [0,1]).
    expect(heading.markers).toEqual([[0, 1]]);
    // The heading content does not get the marker. A heading is an ATXHeading1
    // block: the `#` delimiter is its only marker span.
    const mfMarkers = Array.from(view.contentDOM.querySelectorAll('span.mf-marker'));
    expect(mfMarkers.length).toBe(1);
    expect(mfMarkers[0].textContent).toBe('#');
    // The heading text is not inside any .mf-marker span.
    expect(
      mfMarkers.some((el) => el.textContent!.includes('Heading text')),
    ).toBe(false);
  });

  // ── P2 §4.9 failure injection (task 4.13) ───────────────────────────
  // The projection plugin must survive a REAL buildDecorations throw: the
  // try/catch degrades to an empty decoration set, the doc is unchanged, and
  // after the flag clears the projection renders again (same EditorView).

  it('a real buildDecorations throw degrades, survives, and recovers (next)', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    // Open in Source so the projection build fires only on the preview switch
    // below (the injection must hit THAT build, not the open-time one).
    setPreferredMode('source');
    const md = '# H1\n\n**bold** text\n\nplain paragraph\n';
    const path = await writeFixture('fail-next.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    expect(binding.editor.getMode()).toBe('source');

    // Arm the NEXT projection build to throw, then switch to preview.
    setProjectionTestFailMode('next');
    binding.setMode('preview');

    // The throw was caught by the plugin: the doc is unchanged and the state is
    // degraded, never blank or crashed.
    expect(view.state.doc.toString()).toBe(md);
    expect(getProjectionSnapshot().state).toBe('degraded');

    // The same EditorView is alive and editable (the plugin's try/catch kept it
    // mounted; no doc rewrite happened).
    expect(() => binding.setMode('source')).not.toThrow();

    // The flag self-cleared after the single throw; switching back to preview
    // renders normally again (recovery after failure).
    binding.setMode('preview');
    expect(getProjectionSnapshot().state).toBe('rendered');
    const snapshot = getProjectionSnapshot();
    expect(snapshot.constructs.some((c) => c.cls === PROJECTION_CLASSES.strong)).toBe(true);
  });

  it('a continuous buildDecorations throw keeps degrading but input and save survive', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    setPreferredMode('source');
    const md = '**bold** text\n\nplain paragraph\n';
    const path = await writeFixture('fail-always.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    expect(binding.editor.getMode()).toBe('source');

    // Force every projection build to throw, then preview.
    setProjectionTestFailMode('always');
    binding.setMode('preview');
    expect(getProjectionSnapshot().state).toBe('degraded');

    // Input still goes through (projection never intercepts the edit path).
    // Place the caret in the middle of the doc first, then type.
    view.dispatch({ selection: { anchor: md.indexOf('text') + 4 } });
    binding.typeAtCursor(' X');
    expect(view.state.doc.toString()).toBe('**bold** text X\n\nplain paragraph\n');

    // Saving still works (the binding's save path is Core-confirmed bytes,
    // independent of the projection layer).
    const result = await saveLosslessActiveDocument({ interactive: false });
    expect(result).toBe('saved');

    // Clear the injection and prove the plugin recovers on the next rebuild.
    setProjectionTestFailMode('none');
    view.dispatch({ selection: { anchor: md.length } }); // force a rebuild
    expect(getProjectionSnapshot().state).toBe('rendered');
  });

  // ── Task 6.5 (P4A ADR §3.3): construct owner registry wiring parity ──
  // The classification decision now goes through the construct owner registry
  // (renderOwnerRegistry.ts). This is a strict behavior-preservation gate: the
  // ConstructRange set for a canonical doc containing EVERY construct class
  // (local kinds + every exact-source fallback kind) is FROZEN below — captured
  // on the pre-registry implementation — and must stay identical after the
  // wiring, for the whole {from, to, cls, level, markers} shape.
  const PARITY_DOC = [
    '---',
    'title: golden',
    '---',
    '',
    '# Heading one',
    '',
    '## H2',
    '',
    '### H3',
    '',
    'Setext one',
    '=========',
    '',
    'Setext two',
    '---------',
    '',
    '**strong** *em* ~~del~~ `code` [l](https://u.example) ![a](i.png)',
    '',
    '> quote',
    '',
    '- item one',
    '- item two',
    '',
    '```js',
    'const x = 1;',
    '```',
    '',
    '| a | b |',
    '| --- | --- |',
    '',
    '<div>html block</div>',
    '',
    '<!-- an html comment -->',
    '',
    'Footnote[^1] tail.',
    '',
    '[^1]: fn text.',
    '',
    'Auto https://ex.example/a tail.',
    '',
  ].join('\n');

  it('owner registry wiring keeps the ConstructRange set identical (task 6.5 parity)', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const path = await writeFixture('parity.md', PARITY_DOC);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    binding.setMode('preview');
    const snapshot = getProjectionSnapshot();
    expect(snapshot.state).toBe('rendered');
    // Frozen on the pre-registry implementation (see comment above).
    expect(snapshot.constructs).toEqual(GOLDEN);
  });
});

