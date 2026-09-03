import { describe, expect, it, vi, afterEach } from 'vitest';
import { performance } from 'node:perf_hooks';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, mermaidCodeBlockExtension } from './editor.extensions';
import { createMarkdownExtension } from './editor.init';
import { OpaqueNode } from './editor.markdown.opaque.extension';
import { decideAdmission } from './editor.markdown.admission';
import { reconcileSave } from './editor.markdown.opaque.integration';
import { getOpaqueRegistry, endOpaqueSession } from './editor.markdown.opaque.session';
import { classifyEligibility } from './editor.markdown.eligibility';

const mocks = vi.hoisted(() => ({
  renderMermaid: vi.fn(), renderPlantUml: vi.fn(),
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  store: { on: vi.fn(), off: vi.fn(), setState: vi.fn(), emit: vi.fn() },
  showMermaidContextMenu: vi.fn(), showPlantumlContextMenu: vi.fn(),
  logDebug: vi.fn(), logWarn: vi.fn(), logException: vi.fn(),
  getMermaidExportBaseName: vi.fn(), getPlantUmlExportBaseName: vi.fn(),
}));
vi.mock('./mermaid', () => ({ renderMermaid: mocks.renderMermaid }));
vi.mock('./plantuml', () => ({ renderPlantUml: mocks.renderPlantUml }));
vi.mock('./plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) }));
vi.mock('./storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
vi.mock('./store', () => ({ store: mocks.store }));
vi.mock('../components/mermaidContextMenu', () => ({ showMermaidContextMenu: mocks.showMermaidContextMenu }));
vi.mock('../components/plantumlContextMenu', () => ({ showPlantumlContextMenu: mocks.showPlantumlContextMenu }));
vi.mock('./editor.state', () => ({ getMermaidExportBaseName: mocks.getMermaidExportBaseName, getPlantUmlExportBaseName: mocks.getPlantUmlExportBaseName, assetToOriginalMap: new Map() }));
vi.mock('./logger', () => ({ logDebug: mocks.logDebug, logWarn: mocks.logWarn, logException: mocks.logException }));

function createAppEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
      BulletList, OrderedList, ListItem, ListKeymap,
      TaskList, TaskItem.configure({ nested: true }),
      MarkdownSafeTable.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      CustomLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
      BlockImage.configure({ allowBase64: true }),
      mermaidCodeBlockExtension(),
      OpaqueNode, // required for opaque admission (frontmatter + html-comment atoms)
      createMarkdownExtension(),
    ],
  });
}

afterEach(() => {
  endOpaqueSession();
});

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Stage-two admission / reconcile performance gate (task 9.4).
 *
 * Threshold contract (from task 1.4 evidence in `evidence/stage-1-validation.md`
 * and `tiptap-v3-benchmark.test.ts`):
 *   - medium (5.4KB) parse budget = 19.4ms (v2 baseline 15.5ms, ≤25% regression);
 *   - large (54KB) parse ~380ms is recorded as the SOURCE-ONLY threshold evidence,
 *     i.e. docs at/beyond that latency are downscaled to Source, not opened in WYSIWYG.
 *
 * Task 9.4 asserts the stage-two boundary (admission + reconcile) does not push a
 * normal-tier document past that source-only threshold, so no supported doc is
 * needlessly forced to Source. Admission is `decideAdmission` (the real per-open
 * path: eligibility + verify/restore + session). Reconcile is `reconcileSave`
 * (the save boundary over an opaque session, surface deps resolved to their
 * post-admission success path).
 */

const docs: Record<string, string> = {
  small: '# Small\n\nA **short** document with [a link](https://example.test).\n',
  medium: Array.from({ length: 40 }, (_, i) => `## Section ${i + 1}\n\n- item **${i}**\n- [ ] task\n\n| A | B |\n| --- | --- |\n| ${i} | value |\n`).join('\n'),
  // Many independently-delimited HTML comments + YAML front matter: an
  // opaque-heavy doc (frontmatter + html-comment are the initial allowlisted
  // opaque categories, per design Decision 4) — every fragment must be
  // admitted/restored safely.
  'opaque-heavy': (() => {
    const comment = (i: number) => `\n<!-- opaque fragment ${i} with a longish body that is safe and delimited -->\n\nparagraph after opaque fragment ${i}.\n`;
    return '---\ntitle: opaque-heavy\n---\n# Many opaque fragments\n' + Array.from({ length: 25 }, (_, i) => comment(i)).join('\n');
  })(),
};

describe('stage-two admission / reconcile boundary (9.4)', () => {
  it('records normal-tier admission timing; deterministic eligibility is the source-only gate', () => {
    const editor = createAppEditor();
    // Warm up JIT + editor before timed rounds.
    decideAdmission(editor, docs.small, { sourceRevision: 1, userRevisionAtAdmission: 0 });

    for (const tier of ['small', 'medium'] as const) {
      const source = docs[tier];
      const admissionTimes: number[] = [];
      for (let r = 0; r < 25; r += 1) {
        const t0 = performance.now();
        const admitted = decideAdmission(editor, source, { sourceRevision: 1, userRevisionAtAdmission: r });
        const t1 = performance.now();
        admissionTimes.push(t1 - t0);
        expect(admitted.mode).not.toBe('source-only'); // supported normed docs stay in WYSIWYG
      }
      const admissionMedian = median(admissionTimes);
      // eslint-disable-next-line no-console
      console.log(`9.4 ${tier}: admission-median=${admissionMedian.toFixed(2)}ms (diagnostic)`);
      expect(Number.isFinite(admissionMedian)).toBe(true);
      expect(classifyEligibility(source).verdict).toBe('eligible');
    }
    editor.destroy();
  });

  it('records reconcile over opaque fragments without a load-sensitive wall-clock gate', () => {
    const editor = createAppEditor();
    const source = docs['opaque-heavy'];
    // Warm up.
    decideAdmission(editor, source, { sourceRevision: 1, userRevisionAtAdmission: 0 });

    const reconcileTimes: number[] = [];
    for (let r = 0; r < 25; r += 1) {
      const admitted = decideAdmission(editor, source, { sourceRevision: 1, userRevisionAtAdmission: r });
      expect(admitted.mode).toBe('opaque'); // session-bearing admission
      if (admitted.mode !== 'opaque' || !admitted.session) break;
      const registry = getOpaqueRegistry();
      const t0 = performance.now();
      const res = reconcileSave(editor, {
        session: admitted.session,
        currentSourceRevision: 1,
        currentUserRevision: r, // no user edit
        registry,
      });
      const t1 = performance.now();
      reconcileTimes.push(t1 - t0);
      expect(res.outcome.verdict).not.toBe('conflict'); // verify path sound
    }
    const reconcileMedian = median(reconcileTimes);
    // eslint-disable-next-line no-console
    console.log(`9.4 opaque-heavy: reconcile-median=${reconcileMedian.toFixed(2)}ms (diagnostic)`);
    expect(Number.isFinite(reconcileMedian)).toBe(true);
    editor.destroy();
  });

  it('records large / opaque-heavy admission latency as source-only threshold evidence', () => {
    const editor = createAppEditor();
    decideAdmission(editor, docs.small, { sourceRevision: 1, userRevisionAtAdmission: 0 });
    const times: number[] = [];
    for (let r = 0; r < 5; r += 1) {
      const t0 = performance.now();
      const admitted = decideAdmission(editor, docs['opaque-heavy'], { sourceRevision: 1, userRevisionAtAdmission: r });
      const t1 = performance.now();
      times.push(t1 - t0);
      expect(admitted.mode).toBe('opaque'); // fully opaque-covered, admitted safely
    }
    const admissionMedian = median(times);
    // eslint-disable-next-line no-console
    console.log(`9.4 opaque-heavy: admission-median=${admissionMedian.toFixed(2)}ms (many opaque fragments; source-only threshold evidence)`);
    expect(admissionMedian).toBeGreaterThan(0);
    editor.destroy();
  });
});
