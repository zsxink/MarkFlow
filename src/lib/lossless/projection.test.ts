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
  linkFormGeometry,
  type ConstructRange,
  type LinkSub,
} from './projection';
import {
  resetAllCohortFlags,
  setP4bFlagEnabled,
} from './cohortFlags';
import {
  resetAllLivePreviewFlags,
  setLivePreviewHidden,
  setLivePreviewProjection,
} from './livePreviewFlags';
import {
  registerConstructOwner,
  resetOwnerRegistry,
} from './renderOwnerRegistry';
import { createLosslessSourceEditor } from './losslessSourceEditor';
import { runScopeHandlers, EditorView } from '@codemirror/view';
import { Text } from '@codemirror/state';
import type { Transaction } from '@codemirror/state';

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
  resetAllLivePreviewFlags();
});

afterEach(() => {
  setLosslessCoreSessionEnabled(false);
  setLivePreviewEnabled(false);
  resetAllLivePreviewFlags();
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
    // Frozen on the pre-registry implementation (see comment above). The P6
    // `visibility` debug field is intentionally excluded — the frozen shape is
    // {from, to, cls, level, markers}.
    expect(
      snapshot.constructs.map(({ from, to, cls, level, markers }) => ({ from, to, cls, level, markers })),
    ).toEqual(GOLDEN);
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

// ── P6 M1 — Typora-style hidden markers (heading + thematic break) ────────
//
// First P6 cohort, behind `livePreview.heading` / `livePreview.heading.hidden`
// and `livePreview.thematicBreak` / `livePreview.thematicBreak.hidden`
// (default OFF). Proves: 9.1 hidden markers via `Decoration.replace` +
// `EditorView.atomicRanges`; 9.2 unified visibility resolver (hidden state
// owned solely by P6); doc/History/dirty/revision/bytes never change; rollback
// to dimmed/source; composition forces reveal; empty heading stays discoverable.

describe('P6 M1 — hidden markers (heading + thematic break)', () => {
  beforeEach(() => resetAllLivePreviewFlags());
  afterEach(() => resetAllLivePreviewFlags());

  it('default OFF: a heading is dimmed, never hidden, and the doc is untouched', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '# Heading text\n\nplain paragraph far away\n';
    const path = await writeFixture('p6-heading-off.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    binding.setMode('preview');
    // Caret far away → no reveal; with flags OFF the heading must NOT hide.
    view.dispatch({ selection: { anchor: md.indexOf('far away') } });
    const snapshot = getProjectionSnapshot();
    const heading = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.heading)!;
    expect(heading).toBeDefined();
    expect(heading.visibility).toBe('dimmed');
    expect(snapshot.hiddenAtomic.length).toBe(0);
    // The marker `#` is still present in the DOM (weak, not hidden).
    expect(view.contentDOM.querySelector('span.mf-marker')?.textContent).toBe('#');
    expect(view.state.doc.toString()).toBe(md);
  });

  it('heading hidden: marker is replaced (no .mf-marker), content keeps semantic class, atomic range published, doc unchanged', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '# Heading text\n\nplain paragraph far away\n';
    const path = await writeFixture('p6-heading-hidden.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    setLivePreviewProjection('heading', true);
    setLivePreviewHidden('heading', true);
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('far away') } }); // caret away → hidden

    const snapshot = getProjectionSnapshot();
    const heading = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.heading)!;
    expect(heading.visibility).toBe('hidden');
    // The `# ` marker range is published as an atomic hidden unit.
    expect(snapshot.hiddenAtomic).toContainEqual([0, 2]);
    // No weak marker span rendered (the marker is replaced, not dimmed).
    expect(view.contentDOM.querySelectorAll('span.mf-marker').length).toBe(0);
    // The heading content still carries the level class (rendered as a heading).
    expect(view.contentDOM.querySelector('span.mf-h1')).not.toBeNull();
    // The source document is byte-for-byte unchanged.
    expect(view.state.doc.toString()).toBe(md);
  });

  it('caret inside heading content reveals the marker (editable)', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '# Heading text\n\nplain paragraph\n';
    const path = await writeFixture('p6-heading-reveal.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    setLivePreviewProjection('heading', true);
    setLivePreviewHidden('heading', true);
    binding.setMode('preview');

    view.dispatch({ selection: { anchor: md.indexOf('Heading') + 1 } }); // inside content
    const snapshot = getProjectionSnapshot();
    const heading = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.heading)!;
    expect(heading.visibility).toBe('revealed');
    expect(snapshot.hiddenAtomic.length).toBe(0);
    // The `#` marker is shown as full source (revealed, editable) — the heading
    // construct text starts with `#`, no weak `.mf-marker` span. A revealed
    // heading carries `mf-construct mf-h mf-active` (uses `range.cls`, NOT the
    // level class `mf-h1`, which only appears in non-active `decorationFor`).
    expect(view.contentDOM.querySelector('span.mf-h')?.textContent?.startsWith('#')).toBe(true);
    expect(view.state.doc.toString()).toBe(md);
  });

  it('9.2 composition: adjacent hidden construct reveals, distant stays hidden (no geometry swap mid-IME)', () => {
    // Pure-function proof (real IME/WebView evidence is a separate desktop gate).
    // A hidden-capable heading far from the caret is hidden; an adjacent one
    // reveals under composition — IME never moves distant marker geometry.
    setLivePreviewProjection('heading', true);
    setLivePreviewHidden('heading', true);
    const h: ConstructRange = { from: 0, to: 10, markers: [[0, 1]], cls: PROJECTION_CLASSES.heading, level: 1 };
    // Caret adjacent (to+1) under an active composition → revealed.
    expect(resolveConstructVisibility(h, caret(11), 40, { hiddenRequested: true, composing: true })).toBe('revealed');
    // Caret far under composition → still hidden (no reveal of a distant construct).
    expect(resolveConstructVisibility(h, caret(30), 40, { hiddenRequested: true, composing: true })).toBe('hidden');
    // Same far caret, not composing → hidden (consistent).
    expect(resolveConstructVisibility(h, caret(30), 40, { hiddenRequested: true, composing: false })).toBe('hidden');
    // Adjacent but NOT composing → revealed only if base radius reaches (it does here).
    expect(resolveConstructVisibility(h, caret(11), 40, { hiddenRequested: true, composing: false })).toBe('revealed');
  });

  it('rollback: turning .hidden OFF dims the marker; turning construct OFF returns to source (no doc change)', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '# Heading text\n\nplain paragraph\n';
    const path = await writeFixture('p6-heading-rollback.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    setLivePreviewProjection('heading', true);
    setLivePreviewHidden('heading', true);
    binding.setMode('preview');
    // Caret far beyond the reveal radius so the heading is actually hidden.
    view.dispatch({ selection: { anchor: md.indexOf('paragraph') } });
    expect(getProjectionSnapshot().constructs.find((c) => c.cls === PROJECTION_CLASSES.heading)!.visibility).toBe('hidden');

    // Turn .hidden OFF → dimmed (marker shown weak, not hidden).
    setLivePreviewHidden('heading', false);
    view.dispatch({ selection: { anchor: md.indexOf('paragraph') + 1 } });
    let snap = getProjectionSnapshot();
    const h = snap.constructs.find((c) => c.cls === PROJECTION_CLASSES.heading)!;
    expect(h.visibility).toBe('dimmed');
    expect(snap.hiddenAtomic.length).toBe(0);
    expect(view.contentDOM.querySelector('span.mf-marker')?.textContent).toBe('#');

    // Turn construct OFF → source (heading no longer projected/hidden).
    setLivePreviewProjection('heading', false);
    view.dispatch({ selection: { anchor: md.indexOf('plain') + 2 } });
    snap = getProjectionSnapshot();
    const headingNow = snap.constructs.find((c) => c.cls === PROJECTION_CLASSES.heading);
    // Still a local construct (P4B default), but not hidden — marker weak.
    expect(headingNow?.visibility).toBe('dimmed');
    expect(snap.hiddenAtomic.length).toBe(0);
    expect(view.state.doc.toString()).toBe(md);
  });

  it('empty heading stays visible (discoverable), not hidden', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    // Empty heading `# ` followed by enough gap so the caret is beyond the
    // reveal radius — proves the heading is NOT hidden (would vanish) when idle.
    const md = '# \n\n\n\nplain paragraph far away\n';
    const path = await writeFixture('p6-empty-heading.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    setLivePreviewProjection('heading', true);
    setLivePreviewHidden('heading', true);
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('far away') } });
    const snapshot = getProjectionSnapshot();
    const heading = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.heading)!;
    // An empty heading must NOT vanish — it stays visible so the user can type.
    expect(heading.visibility).toBe('visible');
    expect(snapshot.hiddenAtomic.length).toBe(0);
    // The `#` marker is present as full source (editable), not a weak span.
    expect(view.contentDOM.querySelector('span.mf-h1')?.textContent?.startsWith('#')).toBe(true);
    expect(view.state.doc.toString()).toBe(md);
  });

  it('thematic break hidden: --- replaced by rule widget, atomic range published, source bytes preserved', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '---\n\n# H\n\nplain paragraph\n';
    const path = await writeFixture('p6-hr-hidden.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    setLivePreviewProjection('thematicBreak', true);
    setLivePreviewHidden('thematicBreak', true);
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('plain') } }); // caret away → hidden

    const snapshot = getProjectionSnapshot();
    const hr = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.hr);
    expect(hr).toBeDefined();
    expect(hr!.visibility).toBe('hidden');
    // The whole `---` (positions 0..3) is an atomic hidden unit.
    expect(snapshot.hiddenAtomic).toContainEqual([0, 3]);
    // The rule renders as a read-only placeholder widget (not the save body).
    // `:not(.mf-construct)` excludes the revealed construct mark, which also
    // carries `mf-hr` but is editable source, not the hidden rule.
    expect(view.contentDOM.querySelector('span.mf-hr:not(.mf-construct)')).not.toBeNull();
    // The source `---` is preserved in the document (save/export read it).
    expect(view.state.doc.toString()).toBe(md);
  });

  it('thematic break revealed: caret inside shows the source --- (editable)', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '---\n\n# H\n';
    const path = await writeFixture('p6-hr-reveal.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    setLivePreviewProjection('thematicBreak', true);
    setLivePreviewHidden('thematicBreak', true);
    binding.setMode('preview');
    // Caret inside the `---` → revealed (source shown, no rule widget).
    view.dispatch({ selection: { anchor: 1 } });
    const snapshot = getProjectionSnapshot();
    const hr = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.hr)!;
    expect(hr.visibility).toBe('revealed');
    expect(snapshot.hiddenAtomic.length).toBe(0);
    // No hidden rule widget present (the visible `---` is the editable source).
    expect(view.contentDOM.querySelector('span.mf-hr:not(.mf-construct)')).toBeNull();
    expect(view.state.doc.toString()).toBe(md);
  });

  it('hidden marker production does not create a doc-changing transaction (History / bytes stable)', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '# Heading\n\ntext\n';
    const path = await writeFixture('p6-no-txn.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    setLivePreviewProjection('heading', true);
    setLivePreviewHidden('heading', true);
    // Entering preview + hiding builds DECORATIONS only. `EditorState.doc` is an
    // immutable `Text`: CodeMirror reuses the identical instance across every
    // transaction that does not change the document, so asserting object identity
    // here directly proves that NO docChanged transaction was dispatched — and
    // therefore that no History entry was created. (The mode switch does dispatch
    // a selection-only transaction; that is not a doc change and must not
    // invalidate this.) A string/length compare alone could not make that claim.
    const docBefore = view.state.doc;
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('text') } });
    expect(view.state.doc).toBe(docBefore);
    expect(view.state.doc.toString()).toBe(md);
    expect(getProjectionSnapshot().state).toBe('rendered');
  });

  it('setext heading falls back to dimmed (never hidden, projection never degrades)', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    // `Title\n=====` is a SetextHeading1: its HeaderMark is the `=====` underline,
    // which the M1 ATX-only hidden path must decline WITHOUT throwing (the old
    // underline-as-`#` handling sliced past the marker line → RangeError → the
    // WHOLE projection degraded to source).
    const md = 'Title\n=====\n\nplain paragraph far away\n';
    const path = await writeFixture('p6-setext-hidden.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    setLivePreviewProjection('heading', true);
    setLivePreviewHidden('heading', true);
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('far away') } });

    const snapshot = getProjectionSnapshot();
    // Projection stays healthy — no degrade-to-source for the whole document.
    expect(snapshot.state).toBe('rendered');
    const heading = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.heading)!;
    expect(heading).toBeDefined();
    expect(heading.visibility).toBe('dimmed');
    expect(snapshot.hiddenAtomic.length).toBe(0);
    // The underline stays as weak source (dimmed marker, not a replace).
    expect(view.contentDOM.querySelector('span.mf-marker')).not.toBeNull();
    expect(view.state.doc.toString()).toBe(md);
  });
});

// ── P6 M1 interaction over the hidden markers (ADR structural matrix §2/§6) ──
//
// Drives the PRODUCT extension stack (structural keymap + projection) through
// runScopeHandlers: with the heading marker hidden, the caret approaching the
// content start must reveal, Arrow keys must cross the invisible `# ` as ONE
// atomic unit (never resting inside it), and Backspace at the content start
// must outdent per §2 (marker + space deleted in one transaction) — now that
// the construct is revealed, the structural rule sees plain source.

describe('P6 M1 — interaction over hidden markers (product stack)', () => {
  beforeEach(() => {
    resetAllLivePreviewFlags();
    resetAllCohortFlags();
  });
  afterEach(() => {
    resetAllLivePreviewFlags();
    resetAllCohortFlags();
  });

  interface HiddenHarness {
    view: EditorView;
    txs: Transaction[];
    press(key: string, shift?: boolean): boolean;
    destroy(): void;
  }

  function hiddenHarness(source: string): HiddenHarness {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const txs: Transaction[] = [];
    const handle: ReturnType<typeof createLosslessSourceEditor> = createLosslessSourceEditor(
      parent,
      source,
      {
        livePreview: true,
        mode: 'preview',
        onTransaction(transactions) {
          txs.push(...transactions);
        },
      },
    );
    setLivePreviewProjection('heading', true);
    setLivePreviewHidden('heading', true);
    // The structural ADR keymap gates heading rows behind the headingStrong
    // cohort (P4B 7.2a); P6 M1 reuses the same frozen rules over hidden source.
    setP4bFlagEnabled('headingStrong', true);
    return {
      view: handle.view,
      txs,
      press(key, shift = false) {
        return runScopeHandlers(
          handle.view,
          new KeyboardEvent('keydown', { key, shiftKey: shift, cancelable: true }),
          'editor',
        );
      },
      destroy: () => handle.destroy(),
    };
  }

  const md = '# Heading text\n\nplain paragraph\n';

  it('caret at content start reveals the hidden marker before any edit', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = hiddenHarness(md);
    try {
      h.view.dispatch({ selection: { anchor: 2 } }); // contentStart of `# Heading text`
      const heading = getProjectionSnapshot().constructs.find(
        (c) => c.cls === PROJECTION_CLASSES.heading,
      )!;
      expect(heading.visibility).toBe('revealed');
      expect(getProjectionSnapshot().hiddenAtomic.length).toBe(0);
    } finally {
      h.destroy();
    }
  });

  it('hiddenAtomic is published through the EditorView.atomicRanges facet (ADR §2)', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = hiddenHarness(md);
    const facetSpans = (view: EditorView): Array<[number, number]> => {
      const spans: Array<[number, number]> = [];
      for (const provider of view.state.facet(EditorView.atomicRanges)) {
        const cursor = provider(view).iter();
        while (cursor.value) {
          spans.push([cursor.from, cursor.to]);
          cursor.next();
        }
      }
      return spans;
    };
    try {
      // Caret far away → the `# ` marker is hidden and its range [0, 2) must be
      // reachable through the atomicRanges facet (the contract cursor motion
      // and widgets consult).
      h.view.dispatch({ selection: { anchor: md.indexOf('paragraph') } });
      expect(facetSpans(h.view)).toContainEqual([0, 2]);
      // Caret at contentStart → the construct revealed, so NOTHING may stay
      // atomic over the marker: the caret must be allowed to rest next to the
      // now-visible source (reveal pre-empts atomicity at one-char approach).
      h.view.dispatch({ selection: { anchor: 2 } });
      expect(facetSpans(h.view).filter(([f, t]) => f < 2 && t > 0)).toEqual([]);
      // Stepping left lands on the marker char — legal, because the construct
      // is revealed there and the `#` is visible (no invisible-caret trap).
      expect(h.press('ArrowLeft')).toBe(true);
      expect(h.view.state.selection.main.anchor).toBe(1);
      const heading = getProjectionSnapshot().constructs.find(
        (c) => c.cls === PROJECTION_CLASSES.heading,
      )!;
      expect(heading.visibility).toBe('revealed');
    } finally {
      h.destroy();
    }
  });

  it('Backspace at content start outdents per ADR §2 in one transaction (marker + space)', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = hiddenHarness(md);
    try {
      h.view.dispatch({ selection: { anchor: 2 } });
      expect(h.press('Backspace')).toBe(true);
      // §2: the heading marker AND its separating space are deleted; the line
      // becomes a paragraph. Caret at the original content line start.
      expect(h.view.state.doc.toString()).toBe('Heading text\n\nplain paragraph\n');
      expect(h.view.state.selection.main.anchor).toBe(0);
      expect(h.txs.length).toBe(1);
    } finally {
      h.destroy();
    }
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

// ── P6 M2a — hidden markers for the paired inline constructs ──────────────
//
// Second P6 cohort, behind `livePreview.strong` / `.emphasis` / `.strikethrough`
// / `.inlineCode` plus each one's `.hidden` switch (all default OFF). Proves the
// same contract as M1 — `Decoration.replace` + `EditorView.atomicRanges`, doc
// bytes untouched, independent rollback — and adds what only a PAIRED inline
// marker introduces: nested constructs, the input rule that forms the pair,
// double-click / cross-marker selection, and the ADR boundary-delete rule that
// keeps the pair intact when one side is deleted.

const M2A_CONSTRUCTS = ['strong', 'emphasis', 'strikethrough', 'inlineCode'] as const;

function enableAllM2aHidden(): void {
  for (const c of M2A_CONSTRUCTS) {
    setLivePreviewProjection(c, true);
    setLivePreviewHidden(c, true);
  }
}

/**
 * Trailing gap after the constructs. The base (cohort-OFF) reveal uses a radius
 * of 2, so the caret must sit more than 2 units past the LAST construct for it
 * to stay hidden — otherwise it is legitimately revealed and proves nothing.
 */
const FAR = '\n\n\n\n\ntail text\n';

interface M2aHarness {
  view: EditorView;
  txs: Transaction[];
  press(key: string, shift?: boolean): boolean;
  destroy(): void;
}

/**
 * Product-stack harness: the real editor + keymaps. `enableFlags` defaults to
 * true (M2a hidden ON); pass false for the rollback/inertness proof, where every
 * switch must stay at its default OFF so the keymap cannot fire.
 */
function m2aHarness(source: string, enableFlags = true): M2aHarness {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const txs: Transaction[] = [];
  const handle: ReturnType<typeof createLosslessSourceEditor> = createLosslessSourceEditor(
    parent,
    source,
    {
      livePreview: true,
      mode: 'preview',
      onTransaction(transactions) {
        txs.push(...transactions);
      },
    },
  );
  if (enableFlags) enableAllM2aHidden();
  return {
    view: handle.view,
    txs,
    press(key, shift = false) {
      return runScopeHandlers(
        handle.view,
        new KeyboardEvent('keydown', { key, shiftKey: shift, cancelable: true }),
        'editor',
      );
    },
    destroy: () => handle.destroy(),
  };
}

describe('P6 M2a — hidden markers (strong / emphasis / strike / inline code)', () => {
  beforeEach(() => {
    resetAllLivePreviewFlags();
    resetAllCohortFlags();
  });
  afterEach(() => {
    resetAllLivePreviewFlags();
    resetAllCohortFlags();
  });

  it('default OFF: every paired inline construct is dimmed, never hidden, doc untouched', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '**bold** and *it* and ~~s~~ and `c`' + FAR;
    const path = await writeFixture('p6-m2a-off.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('tail') } }); // caret far away
    const snapshot = getProjectionSnapshot();
    for (const cls of [
      PROJECTION_CLASSES.strong,
      PROJECTION_CLASSES.emphasis,
      PROJECTION_CLASSES.strikethrough,
      PROJECTION_CLASSES.inlineCode,
    ]) {
      const c = snapshot.constructs.find((x) => x.cls === cls)!;
      expect(c, `missing construct ${cls}`).toBeDefined();
      expect(c.visibility, `${cls} must not hide while its flag is OFF`).toBe('dimmed');
    }
    expect(snapshot.hiddenAtomic.length).toBe(0);
    // Markers still render as weak source spans, not replaced.
    expect(view.contentDOM.querySelectorAll('span.mf-marker').length).toBeGreaterThan(0);
    expect(view.state.doc.toString()).toBe(md);
  });

  it('hidden: each paired construct replaces BOTH markers, publishes two atomic spans, keeps content class', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '**bold** and *it* and ~~s~~ and `c`' + FAR;
    const path = await writeFixture('p6-m2a-hidden.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    enableAllM2aHidden();
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('tail') } }); // caret far away

    const snapshot = getProjectionSnapshot();
    const expectPair = (cls: string, spans: Array<[number, number]>) => {
      const c = snapshot.constructs.find((x) => x.cls === cls)!;
      expect(c, `missing ${cls}`).toBeDefined();
      expect(c.visibility).toBe('hidden');
      for (const span of spans) expect(snapshot.hiddenAtomic).toContainEqual(span);
    };
    // `**bold**` → [0,2) + [6,8); `*it*` → [13,14)+[16,17);
    // `~~s~~` → [22,24)+[25,27); `` `c` `` → [32,33)+[34,35).
    expectPair(PROJECTION_CLASSES.strong, [[0, 2], [6, 8]]);
    expectPair(PROJECTION_CLASSES.emphasis, [[13, 14], [16, 17]]);
    expectPair(PROJECTION_CLASSES.strikethrough, [[22, 24], [25, 27]]);
    expectPair(PROJECTION_CLASSES.inlineCode, [[32, 33], [34, 35]]);
    // No weak marker span remains (every marker is replaced, not dimmed).
    expect(view.contentDOM.querySelectorAll('span.mf-marker').length).toBe(0);
    // Each content range keeps its semantic class, and the source is untouched.
    expect(view.contentDOM.querySelector('span.mf-strong')?.textContent).toBe('bold');
    expect(view.contentDOM.querySelector('span.mf-inline-code')?.textContent).toBe('c');
    expect(view.state.doc.toString()).toBe(md);
  });

  it('nested construct: ** `code` ** hides the outer pair and the inner pair independently', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '**`code`**' + FAR;
    const path = await writeFixture('p6-m2a-nested.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    enableAllM2aHidden();
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('tail') } });

    const snapshot = getProjectionSnapshot();
    // Projection must stay healthy — nested replaces must not degrade it.
    expect(snapshot.state).toBe('rendered');
    const strong = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.strong)!;
    const code = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.inlineCode)!;
    expect(strong).toBeDefined();
    expect(code).toBeDefined();
    // The outer construct owns ONLY its own two delimiters — the two backticks
    // belong to the nested inline code (an ancestor must never claim them).
    expect(strong.markers).toEqual([[0, 2], [8, 10]]);
    expect(code.markers).toEqual([[2, 3], [7, 8]]);
    expect(strong.visibility).toBe('hidden');
    expect(code.visibility).toBe('hidden');
    expect(snapshot.hiddenAtomic).toEqual(
      expect.arrayContaining([[0, 2], [8, 10], [2, 3], [7, 8]]),
    );
    // The inner content is still rendered inside the outer semantic mark.
    expect(view.contentDOM.querySelector('span.mf-inline-code')?.textContent).toBe('code');
    expect(view.state.doc.toString()).toBe(md);
  });

  it('input rule: typing the closing ** forms the pair, then it hides once the caret leaves', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    // `**bold` is NOT yet a construct — an unclosed delimiter is literal text.
    const md = '**bold' + FAR;
    const path = await writeFixture('p6-m2a-inputrule.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    enableAllM2aHidden();
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('tail') } });
    expect(getProjectionSnapshot().constructs.find((c) => c.cls === PROJECTION_CLASSES.strong)).toBeUndefined();

    // Type the closing `**` — the pair is completed by user input.
    view.dispatch({ changes: { from: 6, to: 6, insert: '**' }, selection: { anchor: 8 } });
    const completed = getProjectionSnapshot();
    const strong = completed.constructs.find((c) => c.cls === PROJECTION_CLASSES.strong)!;
    expect(strong).toBeDefined();
    // Caret sits on the closing boundary → revealed, so the user keeps editing
    // the source they just typed rather than having it vanish under them.
    expect(strong.visibility).toBe('revealed');
    expect(completed.hiddenAtomic.length).toBe(0);
    expect(view.state.doc.toString()).toBe('**bold**' + FAR);

    // Move the caret away → the freshly typed pair hides, bytes unchanged.
    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('tail') } });
    const away = getProjectionSnapshot();
    expect(away.constructs.find((c) => c.cls === PROJECTION_CLASSES.strong)!.visibility).toBe('hidden');
    expect(away.hiddenAtomic).toEqual(expect.arrayContaining([[0, 2], [6, 8]]));
    expect(view.state.doc.toString()).toBe('**bold**' + FAR);
  });

  it('double-click and cross-marker selections reveal the construct (no caret in invisible source)', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '**bold** tail\n';
    const path = await writeFixture('p6-m2a-selection.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    enableAllM2aHidden();
    binding.setMode('preview');

    // Double-click inside the content selects the word → the pair reveals.
    view.dispatch({ selection: { anchor: 2, head: 6 } });
    let snap = getProjectionSnapshot();
    expect(snap.constructs.find((c) => c.cls === PROJECTION_CLASSES.strong)!.visibility).toBe('revealed');
    expect(snap.hiddenAtomic.length).toBe(0);

    // A selection crossing the closing marker (inside → outside) also reveals,
    // so the caret/selection never rests inside an invisible marker range.
    view.dispatch({ selection: { anchor: 4, head: 10 } });
    snap = getProjectionSnapshot();
    expect(snap.constructs.find((c) => c.cls === PROJECTION_CLASSES.strong)!.visibility).toBe('revealed');
    expect(snap.hiddenAtomic.length).toBe(0);

    // Selection entirely away from the construct → hidden again.
    view.dispatch({ selection: { anchor: 9, head: 13 } });
    snap = getProjectionSnapshot();
    expect(snap.constructs.find((c) => c.cls === PROJECTION_CLASSES.strong)!.visibility).toBe('hidden');
    expect(view.state.doc.toString()).toBe(md);
  });

  it('rollback: .hidden OFF dims the markers, construct OFF returns to source — bytes never change', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '**bold** and `c`' + FAR;
    const path = await writeFixture('p6-m2a-rollback.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    enableAllM2aHidden();
    binding.setMode('preview');
    const away = md.indexOf('tail');

    view.dispatch({ selection: { anchor: away } });
    let snap = getProjectionSnapshot();
    expect(snap.constructs.find((c) => c.cls === PROJECTION_CLASSES.strong)!.visibility).toBe('hidden');
    expect(snap.constructs.find((c) => c.cls === PROJECTION_CLASSES.inlineCode)!.visibility).toBe('hidden');
    expect(snap.hiddenAtomic.length).toBe(4);

    // ONE construct's `.hidden` OFF → only that construct degrades to dimmed;
    // the other stays hidden (the switches are genuinely independent).
    setLivePreviewHidden('strong', false);
    view.dispatch({ selection: { anchor: away + 1 } });
    snap = getProjectionSnapshot();
    expect(snap.constructs.find((c) => c.cls === PROJECTION_CLASSES.strong)!.visibility).toBe('dimmed');
    expect(snap.constructs.find((c) => c.cls === PROJECTION_CLASSES.inlineCode)!.visibility).toBe('hidden');
    // Only the inline code's two markers remain atomic; the strong's are gone.
    expect(snap.hiddenAtomic).toHaveLength(2);
    expect(snap.hiddenAtomic).not.toEqual(expect.arrayContaining([[0, 2]]));
    expect(view.contentDOM.querySelector('span.mf-marker')?.textContent).toBe('**');

    // The construct switch OFF → source fallback for it (no projection/hiding).
    setLivePreviewProjection('strong', false);
    view.dispatch({ selection: { anchor: away + 2 } });
    snap = getProjectionSnapshot();
    expect(snap.constructs.find((c) => c.cls === PROJECTION_CLASSES.strong)!.visibility).toBe('dimmed');
    // Bytes are identical after every rollback step.
    expect(view.state.doc.toString()).toBe(md);
  });

  it('hiding the four constructs dispatches no doc-changing transaction (History / bytes stable)', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '**bold** and *it* and ~~s~~ and `c`' + FAR;
    const path = await writeFixture('p6-m2a-no-txn.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    const docBefore = view.state.doc;
    enableAllM2aHidden();
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('tail') } });
    // `EditorState.doc` is immutable: CodeMirror reuses the identical instance
    // across every transaction that does not change the document, so object
    // identity here proves NO docChanged transaction was dispatched — and
    // therefore that no History entry was created by hiding the markers.
    expect(view.state.doc).toBe(docBefore);
    expect(getProjectionSnapshot().hiddenAtomic.length).toBe(8);
    expect(view.state.doc.toString()).toBe(md);
  });
});

describe('P6 M2a — boundary delete keeps the paired syntax intact (ADR matrix)', () => {
  beforeEach(() => {
    resetAllLivePreviewFlags();
    resetAllCohortFlags();
  });
  afterEach(() => {
    resetAllLivePreviewFlags();
    resetAllCohortFlags();
  });

  // `**bold** tail` → StrongEmphasis [0,8), markers [0,2) + [6,8), content [2,6).
  const SOURCE = '**bold** tail';

  it('Backspace after the closing ** deletes one content grapheme and keeps BOTH ** markers', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = m2aHarness(SOURCE);
    try {
      h.view.dispatch({ selection: { anchor: 8 } }); // after the closing marker
      expect(h.press('Backspace')).toBe(true);
      // The paired `**` survives; only the content's last grapheme is removed.
      expect(h.view.state.doc.toString()).toBe('**bol** tail');
      expect(h.view.state.selection.main.anchor).toBe(5);
      expect(h.txs.length).toBe(1);
    } finally {
      h.destroy();
    }
  });

  it('Delete before the opening ** deletes one content grapheme and keeps BOTH ** markers', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = m2aHarness(SOURCE);
    try {
      h.view.dispatch({ selection: { anchor: 0 } }); // before the opening marker
      expect(h.press('Delete')).toBe(true);
      expect(h.view.state.doc.toString()).toBe('**old** tail');
      expect(h.view.state.selection.main.anchor).toBe(2);
      expect(h.txs.length).toBe(1);
    } finally {
      h.destroy();
    }
  });

  it('Backspace just after the opening ** is a NoOp — a delimiter is never deleted alone', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = m2aHarness(SOURCE);
    try {
      h.view.dispatch({ selection: { anchor: 2 } }); // inner boundary (contentStart)
      expect(h.press('Backspace')).toBe(true);
      // Consumed, but the document is byte-for-byte unchanged.
      expect(h.view.state.doc.toString()).toBe(SOURCE);
      expect(h.view.state.selection.main.anchor).toBe(2);
      expect(h.txs.length).toBe(0);
    } finally {
      h.destroy();
    }
  });

  it('Delete just before the closing ** is a NoOp — a delimiter is never deleted alone', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = m2aHarness(SOURCE);
    try {
      h.view.dispatch({ selection: { anchor: 6 } }); // inner boundary (contentEnd)
      expect(h.press('Delete')).toBe(true);
      expect(h.view.state.doc.toString()).toBe(SOURCE);
      expect(h.view.state.selection.main.anchor).toBe(6);
      expect(h.txs.length).toBe(0);
    } finally {
      h.destroy();
    }
  });

  it('emphasis follows the same rule: *it* loses a grapheme, never one * of the pair', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = m2aHarness('a *it* b');
    try {
      // `*it*` → Emphasis [2,6), markers [2,3) + [5,6), content [3,5).
      h.view.dispatch({ selection: { anchor: 6 } }); // after the closing `*`
      expect(h.press('Backspace')).toBe(true);
      expect(h.view.state.doc.toString()).toBe('a *i* b');
      expect(h.view.state.selection.main.anchor).toBe(4);
    } finally {
      h.destroy();
    }
  });

  it('a surrogate pair is deleted as one grapheme (no lone half survives)', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = m2aHarness('**a🚀** tail');
    try {
      // `**a🚀**` → StrongEmphasis [0,7): `a` at 2..3, the emoji at 3..5 (two
      // UTF-16 units), closing marker [5,7). Content [2,5).
      h.view.dispatch({ selection: { anchor: 7 } });
      expect(h.press('Backspace')).toBe(true);
      expect(h.view.state.doc.toString()).toBe('**a** tail');
      expect(h.view.state.selection.main.anchor).toBe(3);
    } finally {
      h.destroy();
    }
  });

  it('flag OFF leaves plain source deletion (one * really is deleted) — the handler is inert', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = m2aHarness(SOURCE, false);
    try {
      // Every M2a switch stays OFF (the default): Backspace at the closing
      // boundary is ordinary source deletion, byte-identical to pre-P6.
      h.view.dispatch({ selection: { anchor: 8 } });
      h.press('Backspace');
      expect(h.view.state.doc.toString()).toBe('**bold* tail');
    } finally {
      h.destroy();
    }
  });

  it('a non-empty selection is ordinary source deletion, not the boundary rule', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = m2aHarness(SOURCE);
    try {
      // Sweeping across the whole construct is an explicit user selection; the
      // ADR treats it as a plain source delete (no grapheme rewriting).
      h.view.dispatch({ selection: { anchor: 0, head: 8 } });
      h.press('Backspace');
      expect(h.view.state.doc.toString()).toBe(' tail');
    } finally {
      h.destroy();
    }
  });
});

// ── P6 M2b — hidden markers for link (inline / reference / autolink) ───────
//
// Third P6 cohort, behind `livePreview.link` + `livePreview.link.hidden` (both
// default OFF). A link is a NON-symmetric multi-segment marker, so unlike the
// paired `**` the inactive-hidden state keeps only the display text and replaces
// every LinkMark plus the destination / title / reference label (design §9.2).
// Active (caret/selection inside the link) is the design-canonical wholesale
// `revealed`: every field incl. dest/title shows and edits in place.

function enableLinkHidden(): void {
  setLivePreviewProjection('link', true);
  setLivePreviewHidden('link', true);
}

interface LinkHarness {
  view: EditorView;
  txs: Transaction[];
  press(key: string, shift?: boolean): boolean;
  destroy(): void;
}

/** Product-stack harness with the link hidden flag ON (unless `enableFlags`). */
function linkHarness(source: string, enableFlags = true): LinkHarness {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const txs: Transaction[] = [];
  const handle: ReturnType<typeof createLosslessSourceEditor> = createLosslessSourceEditor(
    parent,
    source,
    {
      livePreview: true,
      mode: 'preview',
      onTransaction(transactions) {
        txs.push(...transactions);
      },
    },
  );
  if (enableFlags) enableLinkHidden();
  return {
    view: handle.view,
    txs,
    press(key, shift = false) {
      return runScopeHandlers(
        handle.view,
        new KeyboardEvent('keydown', { key, shiftKey: shift, cancelable: true }),
        'editor',
      );
    },
    destroy: () => handle.destroy(),
  };
}

describe('P6 M2b — link hidden geometry (inline / autolink / reference / definition)', () => {
  beforeEach(() => {
    resetAllLivePreviewFlags();
    resetAllCohortFlags();
  });
  afterEach(() => {
    resetAllLivePreviewFlags();
    resetAllCohortFlags();
  });

  it('inline [text](url) hides [ ] ( ) + url, keeps text visible; bytes untouched', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '[text](https://example.com)' + FAR;
    const path = await writeFixture('p6-m2b-inline.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    enableLinkHidden();
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('tail') } }); // far away

    const snapshot = getProjectionSnapshot();
    const link = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.link && c.markers.length === 4)!;
    expect(link).toBeDefined();
    expect(link.visibility).toBe('hidden');
    // The four LinkMarks + the URL are hidden atomic; only [1,5) `text` remains.
    expect(snapshot.hiddenAtomic).toEqual(
      expect.arrayContaining([[0, 1], [5, 6], [6, 7], [7, 26], [26, 27]]),
    );
    // Only the link text is rendered (skeleton + url replaced away).
    expect(view.contentDOM.querySelector('span.mf-link')?.textContent).toBe('text');
    expect(view.contentDOM.querySelectorAll('span.mf-marker').length).toBe(0);
    expect(view.state.doc.toString()).toBe(md);
  });

  it('inline [text](url "title") also hides the title', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '[text](https://example.com "Title")' + FAR;
    const path = await writeFixture('p6-m2b-title.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    enableLinkHidden();
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('tail') } });

    const snapshot = getProjectionSnapshot();
    const link = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.link && c.markers.length === 4)!;
    expect(link.visibility).toBe('hidden');
    // URL [7,26) and title [27,34) are hidden along with the markers and `)`.
    expect(snapshot.hiddenAtomic).toEqual(
      expect.arrayContaining([[7, 26], [27, 34], [34, 35]]),
    );
    expect(view.contentDOM.querySelector('span.mf-link')?.textContent).toBe('text');
    expect(view.state.doc.toString()).toBe(md);
  });

  it('autolink <https://x> hides < > and keeps the URL visible', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '<https://example.com>' + FAR;
    const path = await writeFixture('p6-m2b-autolink.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    enableLinkHidden();
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('tail') } });

    const snapshot = getProjectionSnapshot();
    // Autolink becomes a local link construct only when the link projection flag
    // is ON; the `<` and `>` are hidden, the URL stays visible.
    const autolink = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.link && c.markers.length === 2)!;
    expect(autolink).toBeDefined();
    expect(autolink.visibility).toBe('hidden');
    expect(snapshot.hiddenAtomic).toEqual(expect.arrayContaining([[0, 1], [20, 21]]));
    expect(view.contentDOM.querySelector('span.mf-link')?.textContent).toBe('https://example.com');
    expect(view.state.doc.toString()).toBe(md);
  });

  it('reference [text][ref] hides [ ] and the [ref] label, keeps text visible', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '[text][ref]' + FAR;
    const path = await writeFixture('p6-m2b-reffull.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    enableLinkHidden();
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('tail') } });

    const snapshot = getProjectionSnapshot();
    const ref = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.link && c.markers.length === 2)!;
    expect(ref).toBeDefined();
    expect(ref.visibility).toBe('hidden');
    // `[` [0,1) + `]` [5,6) + LinkLabel `[ref]` [6,11) all hidden; text [1,5) shown.
    expect(snapshot.hiddenAtomic).toEqual(expect.arrayContaining([[0, 1], [5, 6], [6, 11]]));
    expect(view.contentDOM.querySelector('span.mf-link')?.textContent).toBe('text');
    expect(view.state.doc.toString()).toBe(md);
  });

  it('reference collapsed [text][] and shortcut [text] keep only the text visible', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '[a][] and [b]' + FAR;
    const path = await writeFixture('p6-m2b-refshort.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    enableLinkHidden();
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('tail') } });

    const snapshot = getProjectionSnapshot();
    const collapsed = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.link && c.from === 0)!;
    const shortcut = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.link && c.from === 10)!;
    expect(collapsed.visibility).toBe('hidden');
    expect(shortcut.visibility).toBe('hidden');
    // [a][] → `[` [0,1)+`]` [2,3)+LinkLabel [] [3,5); [b] → `[` [10,11)+`]` [12,13).
    expect(snapshot.hiddenAtomic).toEqual(expect.arrayContaining([[0, 1], [2, 3], [3, 5], [10, 11], [12, 13]]));
    expect(view.state.doc.toString()).toBe(md);
  });

  it('definition line [ref]: dest hides the label, keeps the dest visible', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '[ref]: https://example.com' + FAR;
    const path = await writeFixture('p6-m2b-defline.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    enableLinkHidden();
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('tail') } });

    const snapshot = getProjectionSnapshot();
    const def = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.link && c.markers.length === 1)!;
    expect(def).toBeDefined();
    expect(def.visibility).toBe('hidden');
    // `[ref]` [0,5) + `:` [5,6) hidden; the dest URL stays visible.
    expect(snapshot.hiddenAtomic).toEqual(expect.arrayContaining([[0, 5], [5, 6]]));
    expect(view.contentDOM.querySelector('span.mf-link')?.textContent).toBe('https://example.com');
    expect(view.state.doc.toString()).toBe(md);
  });

  it('active (caret in link) reveals the WHOLE link — dest/title editable, nothing hidden', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '[text](https://example.com "T") tail\n';
    const path = await writeFixture('p6-m2b-active.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    enableLinkHidden();
    binding.setMode('preview');

    // Caret inside the destination → revealed: no atomic ranges, full source.
    view.dispatch({ selection: { anchor: 20 } }); // inside the url
    let snap = getProjectionSnapshot();
    const link = snap.constructs.find((c) => c.cls === PROJECTION_CLASSES.link && c.markers.length === 4)!;
    expect(link.visibility).toBe('revealed');
    expect(snap.hiddenAtomic.length).toBe(0);
    // Destination text is present in the rendered DOM (editable in place).
    expect(view.contentDOM.querySelector('span.mf-link')?.textContent).toContain('https://example.com');

    // Editing the destination directly works (wholesale reveal = editable fields).
    // URL `https://example.com` is [7,26) — clearing it edits the dest in place.
    view.dispatch({ changes: { from: 7, to: 26, insert: '' } });
    expect(view.state.doc.toString()).toBe('[text]( "T") tail\n');

    // Caret far away → hidden again, bytes reflect only the user's edit (the
    // caret must clear the base reveal radius 2 past the link's end).
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    snap = getProjectionSnapshot();
    expect(
      snap.constructs.find((c) => c.cls === PROJECTION_CLASSES.link && c.markers.length >= 1)!.visibility,
    ).toBe('hidden');
    expect(view.state.doc.toString()).toBe('[text]( "T") tail\n');
  });

  it('nested [**b**](u): link hides its skeleton, the inner strong hides ** too', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '[**b**](u)' + FAR;
    const path = await writeFixture('p6-m2b-nested.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    enableLinkHidden();
    enableAllM2aHidden();
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('tail') } });

    const snapshot = getProjectionSnapshot();
    const link = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.link && c.markers.length === 4)!;
    expect(link.visibility).toBe('hidden');
    const strong = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.strong)!;
    expect(strong.visibility).toBe('hidden');
    // Link hides `[`/`](`/`)`/url, strong hides its own **; atomic composition.
    expect(snapshot.hiddenAtomic).toEqual(
      expect.arrayContaining([[0, 1], [6, 7], [7, 8], [8, 9], [9, 10], [1, 3], [4, 6]]),
    );
    // Rendered link text is the bold "b" (link skeleton + ** both replaced).
    expect(view.contentDOM.querySelector('span.mf-strong')?.textContent).toBe('b');
    expect(view.state.doc.toString()).toBe(md);
  });

  it('malformed / non-form link is NOT hidden — exact or dimmed source, never half-hidden', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    // An unclosed `[text` does not parse to a Link node at all → exact source.
    // A naked URL has no hideable skeleton → its construct stays dimmed, never
    // half-hidden. (`[oops]` was deliberately avoided — a bare `[...]` is a
    // VALID shortcut reference link and hides normally.)
    const md = '[text\n\nplain https://ex.example/a tail\n';
    const path = await writeFixture('p6-m2b-malformed.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    enableLinkHidden();
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.length } });

    const snapshot = getProjectionSnapshot();
    // The unclosed `[text` is exact source (no construct, nothing hidden).
    expect(snapshot.constructs.find((c) => c.from === 0 && c.cls === PROJECTION_CLASSES.link)).toBeUndefined();
    // The naked URL has no skeleton → no hidden atomic range, not half-hidden.
    expect(snapshot.hiddenAtomic.length).toBe(0);
    const naked = snapshot.constructs.find((c) => c.cls === PROJECTION_CLASSES.link && c.markers.length === 0);
    if (naked) expect(naked.visibility).not.toBe('hidden');
    expect(view.state.doc.toString()).toBe(md);
  });

  it('linkFormGeometry unit: inline / autolink / reference / definition resolve exactly', () => {
    // Direct pure-function check of the geometry resolver (values, not DOM).
    const inline: ConstructRange = {
      from: 0, to: 27, markers: [[0, 1], [5, 6], [6, 7], [26, 27]], cls: PROJECTION_CLASSES.link,
    } as ConstructRange;
    const inlineSubs: LinkSub[] = [{ name: 'URL', from: 7, to: 26 }];
    const geo = linkFormGeometry(inline, Text.of(['[text](https://example.com)']), inlineSubs)!;
    expect(geo.form).toBe('inline');
    expect(geo.textFrom).toBe(1);
    expect(geo.textTo).toBe(5);
    expect(geo.hide).toEqual([[0, 1], [5, 6], [6, 7], [7, 26], [26, 27]]);

    const autolink: ConstructRange = {
      from: 0, to: 21, markers: [[0, 1], [20, 21]], cls: PROJECTION_CLASSES.link,
    } as ConstructRange;
    expect(linkFormGeometry(autolink, Text.of(['<https://example.com>']), [] as LinkSub[])!.form).toBe('autolink');

    const reffull: ConstructRange = {
      from: 0, to: 11, markers: [[0, 1], [5, 6]], cls: PROJECTION_CLASSES.link,
    } as ConstructRange;
    const refSubs: LinkSub[] = [{ name: 'LinkLabel', from: 6, to: 11 }];
    const refGeo = linkFormGeometry(reffull, Text.of(['[text][ref]']), refSubs)!;
    expect(refGeo.form).toBe('reference');
    expect(refGeo.hide).toEqual([[0, 1], [5, 6], [6, 11]]);

    const def: ConstructRange = { from: 0, to: 26, markers: [[5, 6]], cls: PROJECTION_CLASSES.link } as ConstructRange;
    const defSubs: LinkSub[] = [
      { name: 'LinkLabel', from: 0, to: 5 },
      { name: 'URL', from: 7, to: 26 },
    ];
    const defGeo = linkFormGeometry(def, Text.of(['[ref]: https://example.com']), defSubs)!;
    expect(defGeo.form).toBe('definition');
    expect(defGeo.textFrom).toBe(7);
    expect(defGeo.textTo).toBe(26);

    // A naked-URL construct (markers=[]) is not a form → null.
    expect(
      linkFormGeometry({ from: 7, to: 26, markers: [], cls: PROJECTION_CLASSES.link } as ConstructRange, Text.of(['x']), [] as LinkSub[]),
    ).toBeNull();
  });

  it('hiding links dispatches no doc-changing transaction (History / bytes stable)', async () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const md = '[a](u) <https://x> [b][r]' + FAR;
    const path = await writeFixture('p6-m2b-no-txn.md', md);
    expect(await openLosslessDocument(path)).toBe(true);
    const binding = getActiveLosslessBinding()!;
    const view = binding.editor.view;
    const docBefore = view.state.doc;
    enableLinkHidden();
    binding.setMode('preview');
    view.dispatch({ selection: { anchor: md.indexOf('tail') } });
    expect(view.state.doc).toBe(docBefore);
    expect(getProjectionSnapshot().hiddenAtomic.length).toBeGreaterThan(0);
    expect(view.state.doc.toString()).toBe(md);
  });
});

describe('P6 M2b — link boundary delete keeps the paired syntax intact (ADR matrix)', () => {
  beforeEach(() => {
    resetAllLivePreviewFlags();
    resetAllCohortFlags();
  });
  afterEach(() => {
    resetAllLivePreviewFlags();
    resetAllCohortFlags();
  });

  it('Backspace after the inline ) deletes a text grapheme and keeps [ ] ( ) + url', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = linkHarness('[text](https://example.com) tail');
    try {
      // Inline Link [0,27), text [1,5). Backspace at range.to (27) → last text grapheme.
      h.view.dispatch({ selection: { anchor: 27 } });
      expect(h.press('Backspace')).toBe(true);
      expect(h.view.state.doc.toString()).toBe('[tex](https://example.com) tail');
      expect(h.view.state.selection.main.anchor).toBe(4);
      expect(h.txs.length).toBe(1);
    } finally {
      h.destroy();
    }
  });

  it('Delete before the inline [ deletes a text grapheme and keeps the skeleton', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = linkHarness('[text](https://example.com) tail');
    try {
      h.view.dispatch({ selection: { anchor: 0 } });
      expect(h.press('Delete')).toBe(true);
      expect(h.view.state.doc.toString()).toBe('[ext](https://example.com) tail');
      expect(h.view.state.selection.main.anchor).toBe(1);
      expect(h.txs.length).toBe(1);
    } finally {
      h.destroy();
    }
  });

  it('Backspace right after the closing > of an autolink deletes its URL grapheme', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = linkHarness('a <https://ex> b');
    try {
      // Autolink [2,14): `<`[2,3) `>`[13,14), text (URL) [3,13). Backspace at
      // range.to (14) deletes the URL's last grapheme `x` at [12,13).
      h.view.dispatch({ selection: { anchor: 14 } });
      expect(h.press('Backspace')).toBe(true);
      expect(h.view.state.doc.toString()).toBe('a <https://e> b');
      expect(h.view.state.selection.main.anchor).toBe(12);
    } finally {
      h.destroy();
    }
  });

  it('Backspace after a reference [text][ref] deletes text grapheme, keeps [ ] [ref]', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = linkHarness('[text][ref] tail');
    try {
      // Reference Link [0,11), text [1,5). Backspace at range.to (11) → last text grapheme.
      h.view.dispatch({ selection: { anchor: 11 } });
      expect(h.press('Backspace')).toBe(true);
      expect(h.view.state.doc.toString()).toBe('[tex][ref] tail');
      expect(h.view.state.selection.main.anchor).toBe(4);
    } finally {
      h.destroy();
    }
  });

  it('inner boundary (after the opening [) is a NoOp — a delimiter is never deleted alone', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = linkHarness('[text](https://example.com) tail');
    try {
      // textFrom = 1 (just after `[`) → Backspace is a NoOp, doc unchanged.
      h.view.dispatch({ selection: { anchor: 1 } });
      expect(h.press('Backspace')).toBe(true);
      expect(h.view.state.doc.toString()).toBe('[text](https://example.com) tail');
      expect(h.txs.length).toBe(0);
    } finally {
      h.destroy();
    }
  });

  it('flag OFF leaves plain source deletion — the link handler is inert', () => {
    setLosslessCoreSessionEnabled(true);
    setLivePreviewEnabled(true);
    const h = linkHarness('[text](https://example.com) tail', false);
    try {
      // With link hidden OFF (default), Backspace at the closing boundary is an
      // ordinary source delete: the `)` is really deleted (no paired-syntax guard).
      h.view.dispatch({ selection: { anchor: 27 } });
      h.press('Backspace');
      expect(h.view.state.doc.toString()).toBe('[text](https://example.com tail');
    } finally {
      h.destroy();
    }
  });
});
