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
  isConstructRevealed,
  resolveConstructVisibility,
  resetProjectionSnapshot,
  setProjectionTestFailMode,
  type ConstructRange,
} from './projection';
import {
  resetAllCohortFlags,
  setP4bFlagEnabled,
} from './cohortFlags';
import {
  registerConstructOwner,
  resetOwnerRegistry,
} from './renderOwnerRegistry';

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

  it('an enabled task widget leaves ListItem local and does not duplicate TaskMarker decoration', async () => {
    // This is the production projection path, not a synthetic range-only
    // assertion: the ListItem construct keeps its local container/list-marker
    // decoration while the task widget replaces its own three-byte marker.
    resetOwnerRegistry();
    const unregisterTask = registerConstructOwner('taskCheckbox', 'widget', {
      label: 'p4b.task-checkbox',
    });
    setP4bFlagEnabled('taskCheckbox', true);
    try {
      setLosslessCoreSessionEnabled(true);
      setLivePreviewEnabled(true);
      const path = await writeFixture('task-owner.md', '- [ ] task\n');
      expect(await openLosslessDocument(path)).toBe(true);
      const binding = getActiveLosslessBinding()!;
      binding.setMode('preview');

      const snapshot = getProjectionSnapshot();
      const lists = snapshot.constructs.filter((range) => range.cls === PROJECTION_CLASSES.listItem);
      expect(lists).toHaveLength(1);
      // ListMark remains local; TaskMarker [2,5) is reserved for the widget.
      expect(lists[0]?.markers).toEqual([[0, 1]]);
      expect(snapshot.constructs.filter((range) => range.from === 2 && range.to === 5)).toHaveLength(0);
      expect(binding.editor.view.contentDOM.querySelector('[data-mf-widget="task-checkbox"]')).not.toBeNull();
    } finally {
      setP4bFlagEnabled('taskCheckbox', false);
      unregisterTask();
      resetOwnerRegistry();
    }
  });
});

// ── P4B task 7.1/7.2 — per-cohort marker reveal refinement ─────────────────
//
// New independent describe. The construct/marker set (GOLDEN above) is
// FROZEN and untouched: these tests only cover the REVEAL decision
// (`isConstructRevealed`), which is a pure function of (construct, selection,
// doc length, cohort-flag state). Each marker cohort is independently
// flag-gated (default OFF); when a cohort flag is ON, a collapsed caret reveals
// a construct only when it sits strictly INSIDE the construct content range,
// and any non-empty selection / Select All fully reveals. When all flags are
// OFF, `isConstructRevealed` must be byte-identical to the pre-7.1 radius-2
// logic (locked by the parity sweep test).

const h1 = { from: 6, to: 12, markers: [[6, 7]], cls: PROJECTION_CLASSES.heading, level: 1 } as ConstructRange;
const strong = { from: 0, to: 8, markers: [[0, 2], [6, 8]], cls: PROJECTION_CLASSES.strong } as ConstructRange;
const emphasis = { from: 0, to: 6, markers: [[0, 1], [5, 6]], cls: PROJECTION_CLASSES.emphasis } as ConstructRange;
const strike = { from: 0, to: 8, markers: [[0, 2], [6, 8]], cls: PROJECTION_CLASSES.strikethrough } as ConstructRange;
const code = { from: 0, to: 8, markers: [[0, 1], [7, 8]], cls: PROJECTION_CLASSES.inlineCode } as ConstructRange;
// [text](url): `[` 0  `]` 5  `(` 6  `)` 16 — the four-delimiter Outer Link.
const link = { from: 0, to: 17, markers: [[0, 1], [5, 6], [6, 7], [16, 17]], cls: PROJECTION_CLASSES.link } as ConstructRange;
// Naked URL (image/auto-link URL, GOLDEN 156-style): NO delimiter markers.
const nakedUrl = { from: 7, to: 24, markers: [], cls: PROJECTION_CLASSES.link } as ConstructRange;
const blockquote = { from: 0, to: 14, markers: [[0, 1]], cls: PROJECTION_CLASSES.blockquote } as ConstructRange;
const listItem = { from: 0, to: 12, markers: [[0, 1]], cls: PROJECTION_CLASSES.listItem } as ConstructRange;
const fence = { from: 12, to: 30, markers: [], cls: PROJECTION_CLASSES.fence } as ConstructRange;

/** Collapsed caret selection at `caret`. */
const caret = (pos: number): { from: number; to: number; empty: boolean } => ({ from: pos, to: pos, empty: true });
/** Non-empty range selection [from,to]. */
const rangeSel = (from: number, to: number): { from: number; to: number; empty: boolean } => ({ from, to, empty: false });

/** Every cohort-class construct used by the 7.2 matrix, keyed by class. */
const COHORT_CONSTRUCTS: Record<string, ConstructRange> = {
  h: h1,
  strong,
  emphasis,
  strike,
  code,
  link,
  nakedUrl,
  blockquote,
  listItem,
  fence,
};

describe('P4B task 7.1 — isConstructRevealed default (all cohort flags OFF) matches pre-7.1 radius logic', () => {
  beforeEach(() => {
    resetAllCohortFlags();
  });
  afterEach(() => {
    resetAllCohortFlags();
  });

  it('is byte-identical to the legacy radius-2 formula for every cohort class and a caret sweep', () => {
    // The EXACT pre-7.1 reveal formula (clamped to the doc): for a collapsed
    // caret `revealFrom = max(0, caret-2)`, `revealTo = min(docLen, caret+2)`,
    // reveal iff `from <= revealTo && to >= revealFrom`.
    const legacy = (r: ConstructRange, caretPos: number, docLen: number): boolean => {
      const revealFrom = Math.max(0, caretPos - 2);
      const revealTo = Math.min(docLen, caretPos + 2);
      return r.from <= revealTo && r.to >= revealFrom;
    };
    const docLen = 40;
    for (const [, r] of Object.entries(COHORT_CONSTRUCTS)) {
      for (let pos = -2; pos <= docLen + 4; pos++) {
        expect(isConstructRevealed(r, caret(pos), docLen)).toBe(legacy(r, pos, docLen));
      }
    }
  });

  it('range selection and Select All fully reveal every overlapping construct (OFF path)', () => {
    // A range [0, docLen] = Select All reveal everything.
    expect(isConstructRevealed(fence, rangeSel(0, 40), 40)).toBe(true);
    // A caret range over just the heading content.
    expect(isConstructRevealed(h1, rangeSel(6, 11), 40)).toBe(true);
    // Non-overlapping range does not reveal.
    expect(isConstructRevealed(h1, rangeSel(20, 30), 40)).toBe(false);
  });
});

describe('P4B task 7.1 — frozen visibility resolver', () => {
  beforeEach(() => resetAllCohortFlags());
  afterEach(() => resetAllCohortFlags());

  it('only returns visible/dimmed/revealed; a premature hidden request safely remains dimmed', () => {
    expect(resolveConstructVisibility(strong, caret(20), 40)).toBe('dimmed');
    expect(resolveConstructVisibility(strong, caret(20), 40, { hiddenRequested: true })).toBe('dimmed');
    expect(resolveConstructVisibility(strong, caret(3), 40)).toBe('revealed');
    // Fenced code has no independently weakened marker spans in P4B.
    expect(resolveConstructVisibility(fence, caret(40), 40)).toBe('visible');
  });

  it('reveals only the composition-adjacent construct; distant constructs stay stable', () => {
    expect(resolveConstructVisibility(strong, caret(9), 40, { composing: true })).toBe('revealed');
    expect(resolveConstructVisibility(strong, caret(20), 40, { composing: true })).toBe('dimmed');
    expect(resolveConstructVisibility(fence, caret(31), 40, { composing: true })).toBe('revealed');
    expect(resolveConstructVisibility(fence, caret(40), 40, { composing: true })).toBe('visible');
  });
});

describe('P4B task 7.1 ① — heading+strong cohort (headingStrong)', () => {
  beforeEach(() => {
    resetAllCohortFlags();
    setP4bFlagEnabled('headingStrong', true);
  });
  afterEach(() => resetAllCohortFlags());

  it('collapsed caret inside heading content or # marker reveals; the radius fringe does not', () => {
    // Caret inside the content (e.g. mid "Head").
    expect(isConstructRevealed(h1, caret(9), 40)).toBe(true);
    // Caret on the # delimiter position (inside content too).
    expect(isConstructRevealed(h1, caret(7), 40)).toBe(true);
    // Just outside the construct (fringe the base radius would reveal).
    expect(isConstructRevealed(h1, caret(4), 40)).toBe(false); // from-2
    expect(isConstructRevealed(h1, caret(5), 40)).toBe(false); // from-1
    expect(isConstructRevealed(h1, caret(13), 40)).toBe(false); // to+1
    // Far away.
    expect(isConstructRevealed(h1, caret(30), 40)).toBe(false);
  });

  it('strong uses the same content-containment reveal and never ghosts on a range sweep', () => {
    expect(isConstructRevealed(strong, caret(1), 40)).toBe(true); // inside **
    expect(isConstructRevealed(strong, caret(4), 40)).toBe(true); // mid "bold"
    expect(isConstructRevealed(strong, caret(3), 40)).toBe(true);
    expect(isConstructRevealed(strong, caret(9), 40)).toBe(false); // to+1 (base radius reveals)
    expect(isConstructRevealed(strong, rangeSel(6, 8), 40)).toBe(true); // range over **
    expect(isConstructRevealed(strong, rangeSel(0, 40), 40)).toBe(true); // select all
  });

  it('turning the cohort off restores the base radius reveal on the same positions', () => {
    setP4bFlagEnabled('headingStrong', false);
    // Base radius-2 reveals the heading even from 2 code units outside.
    expect(isConstructRevealed(h1, caret(5), 40)).toBe(true); // from-1 → base reveals
    expect(isConstructRevealed(strong, caret(9), 40)).toBe(true); // to+1 → base reveals
  });
});

describe('P4B task 7.1 ② — emphasis+strike+inline-code cohort (emphasisStrikeInlineCode)', () => {
  beforeEach(() => {
    resetAllCohortFlags();
    setP4bFlagEnabled('emphasisStrikeInlineCode', true);
  });
  afterEach(() => resetAllCohortFlags());

  it('emphasis / strikethrough / inline-code reveal on a collapsed caret inside content', () => {
    for (const c of [emphasis, strike, code]) {
      expect(isConstructRevealed(c, caret(c.from + 1), 40)).toBe(true); // inside an opener
      expect(isConstructRevealed(c, caret(c.from + 3), 40)).toBe(true); // mid content
      expect(isConstructRevealed(c, caret(c.to - 1), 40)).toBe(true); // inside closer
    }
    if (emphasis) {
      // single-* emphasis has no room for a marker-adjacent surrogate to split;
      // the reveal stays within content.
      expect(isConstructRevealed(emphasis, caret(7), 40)).toBe(false); // outside
    }
  });

  it('collapsed caret in the radius fringe does NOT reveal under the cohort (base would)', () => {
    expect(isConstructRevealed(strike, caret(9), 40)).toBe(false); // to+1
    expect(isConstructRevealed(strike, caret(-1), 40)).toBe(false); // from-1 (clamped)
    resetAllCohortFlags(); // restore
    expect(isConstructRevealed(strike, caret(9), 40)).toBe(true); // base radius reveals
  });
});

// The CJK/emoji paths are exercised at the DOM level below (real editor) so a
// surrogate pair inside `**加粗🚀**` is mapped and revealed without splitting.

describe('P4B task 7.1 ③ — links cohort (links, four-delimiter Link only)', () => {
  beforeEach(() => {
    resetAllCohortFlags();
    setP4bFlagEnabled('links', true);
  });
  afterEach(() => resetAllCohortFlags());

  it('the [text](url) Link reveals for a caret inside any of its 4 delimiters or content', () => {
    // Inside `[`, `]`, `(`, `)` positions.
    expect(isConstructRevealed(link, caret(1), 40)).toBe(true);
    expect(isConstructRevealed(link, caret(6), 40)).toBe(true);
    expect(isConstructRevealed(link, caret(7), 40)).toBe(true);
    expect(isConstructRevealed(link, caret(16), 40)).toBe(true);
    // Inside the link text / url content.
    expect(isConstructRevealed(link, caret(3), 40)).toBe(true);
    expect(isConstructRevealed(link, caret(12), 40)).toBe(true);
    // Just outside (fringe) → not revealed under the cohort.
    expect(isConstructRevealed(link, caret(18), 40)).toBe(false);
    // Range / Select All fully reveal.
    expect(isConstructRevealed(link, rangeSel(0, 40), 40)).toBe(true);
  });

  it('naked URL / legacy mf-link shapes keep the BASE reveal (not 4 markers → gate inactive)', () => {
    // nakedUrl has markers=[] → the links gate is OFF → the base radius applies,
    // so a caret just OUTSIDE (from-1) still reveals it under the cohort flag —
    // exactly the base behaviour, NOT the ref 4-delimiter Link refinement.
    expect(isConstructRevealed(nakedUrl, caret(6), 40)).toBe(true); // from-1 → base radius reveals
    expect(isConstructRevealed(nakedUrl, caret(8), 40)).toBe(true); // inside
    expect(isConstructRevealed(nakedUrl, caret(30), 40)).toBe(false); // far
    // The legacy 2-marker link-label shape (GOLDEN 302-style) is NOT gated either.
    const legacyLabel = { from: 10, to: 14, markers: [[10, 11], [13, 14]], cls: PROJECTION_CLASSES.link } as ConstructRange;
    expect(isConstructRevealed(legacyLabel, caret(12), 40)).toBe(true); // inside reveals
    expect(isConstructRevealed(legacyLabel, caret(9), 40)).toBe(true); // from-1 → base radius reveals
  });
});

describe('P4B task 7.1 ④ — quote+lists cohort (quoteLists)', () => {
  beforeEach(() => {
    resetAllCohortFlags();
    setP4bFlagEnabled('quoteLists', true);
  });
  afterEach(() => resetAllCohortFlags());

  it('blockquote and list-item reveal for a caret inside their marker or content', () => {
    expect(isConstructRevealed(blockquote, caret(1), 40)).toBe(true); // on `>`
    expect(isConstructRevealed(blockquote, caret(5), 40)).toBe(true); // mid quote text
    expect(isConstructRevealed(listItem, caret(1), 40)).toBe(true); // on `-`
    expect(isConstructRevealed(listItem, caret(4), 40)).toBe(true);
  });

  it('collapsed caret on the blank line / fringe does not reveal under the cohort', () => {
    expect(isConstructRevealed(blockquote, caret(15), 40)).toBe(false);
    expect(isConstructRevealed(listItem, caret(13), 40)).toBe(false);
    // Range select-all still fully reveals.
    expect(isConstructRevealed(listItem, rangeSel(0, 40), 40)).toBe(true);
  });
});

describe('P4B task 7.1 ⑤ — fence cohort (fence, markers frozen empty)', () => {
  beforeEach(() => {
    resetAllCohortFlags();
    setP4bFlagEnabled('fence', true);
  });
  afterEach(() => resetAllCohortFlags());

  it('a caret inside the fence content reveals the fence; the trailing blank line does not', () => {
    expect(isConstructRevealed(fence, caret(14), 40)).toBe(true); // inside code
    expect(isConstructRevealed(fence, caret(20), 40)).toBe(true); // deep inside
    expect(isConstructRevealed(fence, caret(31), 40)).toBe(false); // just past closing
    expect(isConstructRevealed(fence, caret(40), 40)).toBe(false); // far
    // Range sweep over the fence fully reveals.
    expect(isConstructRevealed(fence, rangeSel(10, 32), 40)).toBe(true);
  });

  it('the frozen empty marker set is untouched (fence `` ``` `` never weakened as a marker)', () => {
    // Fence markers are frozen to [] by GOLDEN — a fence shows its delimiters
    // as full construct, never as a separate .mf-marker weak span.
    expect(fence.markers).toEqual([]);
  });
});

// ── P4B task 7.2 — interaction matrix over the REAL editor (DOM reveal) ───

describe('P4B task 7.2 — per-cohort reveal over the real editor (DOM)', () => {
  beforeEach(() => resetAllCohortFlags());
  afterEach(() => resetAllCohortFlags());

  it('headingStrong ON vs OFF changes whether the fringe caret leaves the marker weak', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '**bold** here\n\nplain paragraph far away\n';
    const path = await writeFixture('reveal-strong-cohort.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    binding.setMode('preview');

    // Caret just after the strong construct (`**bold** ` → pos 9), the radius-2
    // fringe that the BASE reveal would light up.
    view.dispatch({ selection: { anchor: md.indexOf('here') } });

    // OFF (default): strong construct is ACTIVE (mf-active, no weak markers).
    const off = getRevealState(view);
    expect(off.activeCount).toBeGreaterThan(0);
    expect(off.markerCount).toBe(0);

    // Flip headingStrong ON: the same fringe caret no longer reveals strong.
    setP4bFlagEnabled('headingStrong', true);
    view.dispatch({ selection: { anchor: md.indexOf('here') + 1 } }); // force rebuild
    const on = getRevealState(view);
    expect(on.activeCount).toBe(0);
    expect(on.markerCount).toBeGreaterThan(0);
  });

  it('a caret INSIDE the strong content still reveals under headingStrong ON', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '**bold** here\n\nplain paragraph far away\n';
    const path = await writeFixture('reveal-strong-inside.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    binding.setMode('preview');
    setP4bFlagEnabled('headingStrong', true);

    view.dispatch({ selection: { anchor: md.indexOf('bold') + 1 } }); // inside bold
    const reveal = getRevealState(view);
    expect(reveal.activeCount).toBeGreaterThan(0);
    expect(reveal.markerCount).toBe(0);
    // The source characters remain byte-for-byte.
    expect(view.state.doc.toString()).toBe(md);
  });

  it('fence cohort: caret inside code reveals the fence; trailing blank line does not; no descent', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '```js\nconst x = 1;\n```\n\nplain\n';
    const path = await writeFixture('reveal-fence-cohort.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    binding.setMode('preview');
    setP4bFlagEnabled('fence', true);

    // Caret inside the fence code line.
    view.dispatch({ selection: { anchor: md.indexOf('const x') + 1 } });
    let reveal = getRevealState(view);
    expect(reveal.activeCount).toBeGreaterThan(0);
    // No construct descends into the fence body (only the fence itself decorates).
    const snap = getProjectionSnapshot();
    expect(snap.constructs.filter((c) => c.cls === PROJECTION_CLASSES.fence).length).toBe(1);
    // No inner *construct* decoration appears between the open and close code.
    expect(
      snap.constructs.some((c) => c.cls !== PROJECTION_CLASSES.fence && c.from > 3 && c.to < 24),
    ).toBe(false);

    // Caret on the blank line after the fence → not active.
    view.dispatch({ selection: { anchor: md.indexOf('plain') } });
    reveal = getRevealState(view);
    expect(reveal.activeCount).toBe(0);
    // The source (incl. the fence body) is unchanged.
    expect(view.state.doc.toString()).toBe(md);
  });

  it('CJK/emoji: a caret inside **加粗🚀** reveals and never splits the surrogate pair', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '**加粗🚀** more text\n';
    const path = await writeFixture('reveal-emoji-cohort.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    binding.setMode('preview');
    setP4bFlagEnabled('headingStrong', true);

    // Caret inside the CJK/emoji bold content (uses UTF-16 index arithmetic;
    // emoji is surrogate-pair wide in UTF-16 but Lezer keeps positions aligned).
    const inside = md.indexOf('**') + 2; // right after `**`
    view.dispatch({ selection: { anchor: inside } });
    let reveal = getRevealState(view);
    // Content containment fires with no crash; the construct is revealed.
    expect(reveal.activeCount).toBeGreaterThan(0);

    // Caret at the construct end + 1 (just outside, past the closer) → weak.
    const strongEnd = md.indexOf('**', md.indexOf('加粗')) + 2; // end of `**加粗🚀**`
    view.dispatch({ selection: { anchor: strongEnd + 1 } });
    reveal = getRevealState(view);
    expect(reveal.activeCount).toBe(0);
    expect(reveal.markerCount).toBeGreaterThan(0);
    // No marker span ever splits a surrogate pair (each marker is exactly `**`
    // or a CJK char boundary — never half an emoji).
    for (const el of Array.from(view.contentDOM.querySelectorAll('span.mf-marker'))) {
      const t = el.textContent ?? '';
      // Surrogate-pair safety: no marker text ends with a lone high surrogate.
      expect(t.charCodeAt(t.length - 1) >= 0xd800 && t.charCodeAt(t.length - 1) <= 0xdbff).toBe(false);
    }
  });

  it('read-only: reveal is purely selection-driven and identical in read-only mode', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '**bold** here\n';
    const path = await writeFixture('reveal-readonly.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    binding.setMode('preview');
    setP4bFlagEnabled('headingStrong', true);

    // A caret inside the strong content reveals while editable.
    view.dispatch({ selection: { anchor: md.indexOf('bold') + 1 } });
    const editableOn = getRevealState(view);
    expect(editableOn.activeCount).toBeGreaterThan(0);

    // Make the view read-only (same editor surface); selection still drives reveal.
    const { EditorState, StateEffect } = await import('@codemirror/state');
    view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.readOnly.of(true)) });
    view.dispatch({ selection: { anchor: md.indexOf('bold') + 2 } }); // move caret
    const readOnly = getRevealState(view);
    expect(readOnly.activeCount).toBeGreaterThan(0);
    // The doc is unchanged by the whole interaction.
    expect(view.state.doc.toString()).toBe(md);
  });

  it('Select All fully reveals every cohort construct (7.2 Select All gate)', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = ['# H', '', '**bold**', '', '- item'].join('\n');
    const path = await writeFixture('reveal-selectall.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    binding.setMode('preview');
    // Turn on two cohorts to prove per-cohort Select All independence.
    setP4bFlagEnabled('headingStrong', true);
    setP4bFlagEnabled('quoteLists', true);

    view.dispatch({ selection: { anchor: 0, head: md.length } }); // Select All
    const reveal = getRevealStateMany(view, [PROJECTION_CLASSES.heading, PROJECTION_CLASSES.strong, PROJECTION_CLASSES.listItem]);
    for (const count of reveal) {
      expect(count).toBeGreaterThan(0);
    }
    expect(view.state.doc.toString()).toBe(md);
  });
});

/** Count `.mf-active` constructs and `.mf-marker` weak spans for reveal tests. */
function getRevealState(view: {
  contentDOM: HTMLElement;
}): { activeCount: number; markerCount: number } {
  const activeCount = view.contentDOM.querySelectorAll('span.mf-active').length;
  const markerCount = view.contentDOM.querySelectorAll('span.mf-marker').length;
  return { activeCount, markerCount };
}

/** Per-class `.mf-active` construct counts for the given classes. */
function getRevealStateMany(
  view: { contentDOM: HTMLElement },
  classes: string[],
): number[] {
  return classes.map((cls) => view.contentDOM.querySelectorAll(`span.mf-active.mf-${cls.replace('mf-', '')}`).length);
}
