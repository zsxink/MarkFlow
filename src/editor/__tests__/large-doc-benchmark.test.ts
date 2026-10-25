// ── #411 large-document benchmark — regression baseline ──────────────────
//
// Fixed bottlenecks this file guards against (measured 2026-10-25, M-series,
// fixtures generated in-test; see openspec/changes/large-doc-performance):
//
//   * Marked block-tokenizer `start`/`tokenize` O(remaining) scans made the
//     lexer quadratic once any block extension was registered: 1.9MB
//     fragmented lexed in 22-25s (10MB hung the worker); with bounded
//     `start` (math/opaque/table) + entry guards (ordered/task lists) the
//     same text lexes in ~170ms and 10MB in ~1s.
//   * decideAdmission on 10MB prose: 588ms before, ~220ms after (target ≤5s).
//   * Every-keystroke whole-document serialization (WYSIWYG serialize /
//     source normalizeImageMarkdown) moved into the 400ms dirty-check
//     debounce: keystroke cost is now the bare PM transaction (~0.6ms at
//     10MB prose; normalize alone was 51ms at 50MB).
//   * WYSIWYG structure budget (10k non-blank lines): dense documents are
//     refused before parsing instead of freezing the view (1.9MB fragmented
//     = 23k non-blank lines / 116k PM nodes).
//   * Source mode: CM6 EditorState.create on 50MB ~70ms; IPC JSON
//     encode+decode 43ms.
//
// Assertions are generous magnitude bounds (≈10x the measured figure), not
// tight gates: CI hardware varies, and the point is catching the quadratic
// regressions, not benchmarking.
import { describe, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, ListItem, ListKeymap, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { SafeParagraph, SafeHardBreak, MarkdownSafeTable, CustomLink, BlockImage, MathBlock, mermaidCodeBlockExtension } from '../extensions';
import { FastOrderedList, FastTaskList } from '../extensions/list-fast-tokenizer';
import { createMarkdownExtension, markflowMarked } from '../init';
import { OpaqueNode } from '../markdown/opaque/extension';
import { RawMarkdown } from '../markdown/fallback';
import { VariantListItem, VariantTaskItem } from '../extensions/list-marker-variants';
import { decideAdmission } from '../markdown/admission';
import { classifyEligibility } from '../markdown/eligibility';
import { parseTipTapMarkdown, serializeTipTapMarkdown } from '../markdown/adapter';
import { endOpaqueSession } from '../markdown/opaque/session';

const mocks = vi.hoisted(() => ({
  renderMermaid: vi.fn(), renderPlantUml: vi.fn(),
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  store: { on: vi.fn(), off: vi.fn(), setState: vi.fn(), emit: vi.fn() },
  showMermaidContextMenu: vi.fn(), showPlantumlContextMenu: vi.fn(),
  logDebug: vi.fn(), logWarn: vi.fn(), logException: vi.fn(),
  getMermaidExportBaseName: vi.fn(), getPlantumlExportBaseName: vi.fn(),
}));
vi.mock('../../render/mermaid', () => ({ renderMermaid: mocks.renderMermaid }));
vi.mock('../../render/plantuml', () => ({ renderPlantUml: mocks.renderPlantUml }));
vi.mock('../../render/plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) }));
vi.mock('../../infra/storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
vi.mock('../../infra/store', () => ({ store: mocks.store }));
vi.mock('../../ui/mermaid-context-menu', () => ({ showMermaidContextMenu: mocks.showMermaidContextMenu }));
vi.mock('../../ui/plantuml-context-menu', () => ({ showPlantumlContextMenu: mocks.showPlantumlContextMenu }));
vi.mock('../state', () => ({ getMermaidExportBaseName: mocks.getMermaidExportBaseName, getPlantumlExportBaseName: mocks.getPlantumlExportBaseName, assetToOriginalMap: new Map() }));
vi.mock('../../infra/logger', () => ({ logDebug: mocks.logDebug, logWarn: mocks.logWarn, logException: mocks.logException }));

const MB = 1024 * 1024;
const HUGE = { maxBytes: 100 * MB, maxLines: 2_000_000 };

/** Deterministic sentence filler (mirrors the .tmp/perf-411 generator). */
function filler(i: number): string {
  return `第${i}节。灯塔看守人缓慢地记起潮汐的间隙，然后继续等待；The compass drifted through another tide.`;
}

/** ~targetBytes of long-paragraph prose: few nodes, dense lines. */
function genProse(targetBytes: number): string {
  const parts: string[] = ['# 长篇手稿\n\n'];
  let total = parts[0].length;
  for (let i = 1; total < targetBytes; i += 1) {
    const para: string[] = [];
    let len = 0;
    while (len < 32 * 1024 && total + len < targetBytes) {
      const s = filler(i);
      para.push(s);
      len += s.length * 2; // CJK-heavy sentences ≈ 2 bytes/char in UTF-8
    }
    const p = para.join('');
    parts.push(p, '\n\n');
    total += p.length * 2 + 2;
  }
  return parts.join('');
}

/** Fragmented heading/list/paragraph units (measured ~2 CJK bytes/char). */
function genFragmented(units: number): string {
  const parts: string[] = ['# 碎片集\n\n'];
  for (let i = 1; i <= units; i += 1) {
    parts.push(
      `### 条目 ${i}\n\n`,
      `- 第一项：${filler(i)}\n`,
      `- 第二项带 **重点** 与 \`code-${i}\`\n`,
      `- [ ] 待办事项 ${i}\n`,
      `- [x] 已完成事项 ${i}\n\n`,
      `段落 ${i} 提到 [相关链接](https://example.test/${i})。${filler(i)}\n\n`,
    );
  }
  return parts.join('');
}

function exts() {
  return [
    StarterKit.configure({ paragraph: false, codeBlock: false, hardBreak: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
    SafeParagraph,
    SafeHardBreak,
    BulletList, FastOrderedList, ListItem, VariantListItem, ListKeymap,
    FastTaskList, TaskItem, VariantTaskItem.configure({ nested: true }),
    MarkdownSafeTable.configure({ resizable: true }),
    TableRow, TableCell, TableHeader,
    CustomLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
    BlockImage.configure({ allowBase64: true }),
    mermaidCodeBlockExtension(),
    OpaqueNode,
    MathBlock,
    RawMarkdown,
    createMarkdownExtension(),
  ];
}

/** Headless editor: setContent builds the PM doc without a view. */
function headlessEditor() {
  return new Editor({ element: null as never, extensions: exts() });
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function timed(label: string, rounds: number, fn: () => void): number {
  const all: number[] = [];
  for (let i = 0; i < rounds; i += 1) {
    const t0 = performance.now();
    fn();
    all.push(performance.now() - t0);
  }
  const m = median(all);
  // eslint-disable-next-line no-console
  console.log(`#411-BENCH ${label}: median=${m.toFixed(1)}ms all=[${all.map((x) => x.toFixed(0)).join(',')}]`);
  return m;
}

// eslint-disable-next-line vitest/valid-describe-callback
describe('#411 large-document benchmark', () => {
  it('admits dense documents without a structure or size budget', () => {
    expect(classifyEligibility(genFragmented(2500), HUGE).verdict).toBe('eligible');
    expect(classifyEligibility(genProse(2 * MB), { maxBytes: MB, maxLines: 1 }).verdict).toBe('eligible');
  }, 60_000);

  it('fragmented lexer stays linear with all block tokenizers registered', () => {
    // ~1250 units ≈ 7.5k non-blank lines (within budget), ~0.9MB. The
    // pre-fix cost of this exact shape was quadratic (22s at 1.9MB).
    const ed = headlessEditor();
    const frag = genFragmented(1250);
    const ms = timed('fragmented lexer (~0.9MB, registered extensions)', 3, () => {
      markflowMarked.lexer(frag);
    });
    ed.destroy();
    expect(ms).toBeLessThan(2000);
  }, 120_000);

  it('10MB prose admission chain meets the ≤5s target', () => {
    const ed = headlessEditor();
    ed.commands.setContent('# warm', { contentType: 'markdown' } as never);
    const prose = genProse(10 * MB);
    const ms = timed('decideAdmission 10MB prose', 3, () => {
      decideAdmission(ed, prose, { sourceRevision: 1, userRevisionAtAdmission: 0 }, HUGE);
      endOpaqueSession();
    });
    ed.destroy();
    expect(ms).toBeLessThan(5000);
  }, 300_000);

  it('10MB prose serialize meets the ≤2s save target; keystroke is bare transaction', () => {
    const ed = headlessEditor();
    const prose = genProse(10 * MB);
    expect(parseTipTapMarkdown(ed, prose).ok).toBe(true);
    const serMs = timed('serialize 10MB prose', 3, () => {
      serializeTipTapMarkdown(ed);
    });
    expect(serMs).toBeLessThan(2000);

    const mid = Math.floor(ed.state.doc.content.size / 2);
    ed.commands.setTextSelection(mid);
    const keyMs = timed('1-char PM transaction at 10MB', 5, () => {
      ed.commands.insertContentAt(Math.floor(ed.state.doc.content.size / 2), 'x');
    });
    ed.destroy();
    // The old path added a whole-document serialize per keystroke here.
    expect(keyMs).toBeLessThan(50);
  }, 300_000);

  it('CM6 state creation on 50MB stays well under the ≤3s target', () => {
    const source = genProse(50 * MB);
    const ms = timed('CM6 EditorState.create 50MB (basicSetup)', 3, () => {
      EditorState.create({ doc: source, extensions: [basicSetup] });
    });
    expect(ms).toBeLessThan(3000);
  }, 300_000);

});
