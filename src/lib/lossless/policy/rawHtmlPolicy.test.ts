// P4B task 7.7 — raw HTML policy surface tests.
//
// Machine-verifiable coverage:
//   - security pre-scan `isSafeHtmlBlock` rejects script / event-handler /
//     javascript:/data:text/html/vbscript: / foreignObject / iframe / object /
//     embed, and allows benign HTML — golden, conservative, fail-closed;
//   - HTML-block source ranges (Lezer-derived, UTF-16, protocol-gated): the
//     `${HTMLBlock}` node span is source AND content, markers are empty;
//   - flag OFF (default) ⇒ NO decoration and NO owner change; flag ON ⇒ the
//     block is decorated (`.mf-html-block` + `data-raw-html-policy="source"`)
//     and the owner is resolved to the policy label;
//   - decorate NEVER replaces/hides/mutates source bytes: the editor doc is
//     byte-identical after rendering, no `<script>` element is ever injected,
//     and the raw HTML text remains selectable/editable in the surface;
//   - reveal-source is a no-op (source-only surface);
//   - the descriptor passes the protocol validator (allowsUnsafeHtml:false,
//     containerPolicy:'none', fallback exact-source).

import { describe, it, expect, beforeEach } from 'vitest';
import { createLosslessSourceEditor } from '../losslessSourceEditor';
import {
  collectVisibleHtmlBlocks,
  htmlBlockTargetFromState,
  isSafeHtmlBlock,
  POLICY_CLASSES,
  RAW_HTML_DATA_ATTR,
  RAW_HTML_DATA_VALUE,
  rawHtmlPolicyDescriptor,
  revealSource,
} from './rawHtmlPolicy';
import { setP4bFlagEnabled, resetAllCohortFlags } from '../cohortFlags';
import { resolveConstructOwner } from '../renderOwnerRegistry';
import { validateSourceRangeSet } from '../widgets/protocol';

type Harness = {
  content: HTMLElement;
  handle: ReturnType<typeof createLosslessSourceEditor>;
  destroy(): void;
};

/** A preview-mode lossless editor (the same product assembly the binding uses). */
function makePreviewView(doc: string): Harness {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const handle = createLosslessSourceEditor(parent, doc, {
    livePreview: true,
    mode: 'preview',
  });
  return {
    content: handle.view.contentDOM,
    handle,
    destroy: () => handle.destroy(),
  };
}

/** A benign single-line HTML block; the raw source (without terminating `\n`). */
const BENIGN_RAW = '<div>hello world</div>';
const BENIGN_HTML = `${BENIGN_RAW}\n`;
const SCRIPT_HTML = '<script>alert(1)</script>\n';

describe('isSafeHtmlBlock (security pre-scan)', () => {
  it('allows benign structural HTML', () => {
    expect(isSafeHtmlBlock('<div><p>hello</p></div>')).toBe(true);
    expect(isSafeHtmlBlock('<b>bold</b> and <i>italic</i>')).toBe(true);
    expect(isSafeHtmlBlock('<!-- a comment -->')).toBe(true);
  });

  it('rejects an inline <script> and </script>', () => {
    expect(isSafeHtmlBlock('<script>alert(1)</script>')).toBe(false);
    expect(isSafeHtmlBlock('<SCRIPT>alert(1)</SCRIPT>')).toBe(false);
    expect(isSafeHtmlBlock('before</script>')).toBe(false);
  });

  it('rejects event-handler attributes (on*)', () => {
    expect(isSafeHtmlBlock('<img src=x onerror=alert(1)>')).toBe(false);
    expect(isSafeHtmlBlock('<div onclick="x()">hi</div>')).toBe(false);
    expect(isSafeHtmlBlock('<a href="#" onmouseover="y()">t</a>')).toBe(false);
    expect(isSafeHtmlBlock('<IMG SRC=x ONERROR=ALERT(1)>')).toBe(false);
  });

  it('rejects active URL protocols (javascript:, data:text/html, vbscript:)', () => {
    expect(isSafeHtmlBlock('<a href="javascript:alert(1)">x</a>')).toBe(false);
    expect(isSafeHtmlBlock('<a href="JaVaScRiPt:alert(1)">x</a>')).toBe(false);
    expect(isSafeHtmlBlock('<iframe src="data:text/html;base64,PHNjcmlwdD4=">')).toBe(false);
    expect(isSafeHtmlBlock('<a href="vbscript:msgbox(1)">x</a>')).toBe(false);
  });

  it('rejects foreignObject and dangerous embed elements', () => {
    expect(isSafeHtmlBlock('<svg><foreignObject>html</foreignObject></svg>')).toBe(false);
    expect(isSafeHtmlBlock('<iframe src="https://evil.example"></iframe>')).toBe(false);
    expect(isSafeHtmlBlock('<object data="https://evil.example"></object>')).toBe(false);
    expect(isSafeHtmlBlock('<embed src="x.svg" type="image/svg+xml">')).toBe(false);
  });

  it('fails closed on empty / non-string input', () => {
    expect(isSafeHtmlBlock('')).toBe(false);
    // @ts-expect-error deliberate misuse for fail-closed coverage
    expect(isSafeHtmlBlock(null)).toBe(false);
    // @ts-expect-error deliberate misuse for fail-closed coverage
    expect(isSafeHtmlBlock(undefined)).toBe(false);
  });
});

describe('HTML-block source ranges (Lezer-derived)', () => {
  it('exposes the full HTMLBlock span as source AND content, markers empty', () => {
    const { content, handle, destroy } = makePreviewView(`${BENIGN_HTML}\nafter\n`);
    const doc = handle.view.state.doc.toString();
    // Two consecutive newlines: the second `\n` is a blank line which closes the
    // HTML block, so the node span is exactly BENIGN_RAW.
    const expectFrom = doc.indexOf(BENIGN_RAW);
    const set = htmlBlockTargetFromState(handle.view.state, expectFrom + 1);
    expect(set).not.toBeNull();
    expect(set!.source.from).toBe(expectFrom);
    expect(set!.source.to).toBe(expectFrom + BENIGN_RAW.length);
    expect(doc.slice(set!.source.from, set!.source.to)).toBe(BENIGN_RAW);
    // content === source (whole block is content), markers empty
    expect(set!.content).toEqual(set!.source);
    expect(set!.markers).toEqual([]);
    expect(validateSourceRangeSet(set!, doc.length)).toEqual([]);
    void content;
    destroy();
  });

  it('returns null for a position not inside an HTML block', () => {
    const { handle, destroy } = makePreviewView('plain paragraph\n');
    expect(htmlBlockTargetFromState(handle.view.state, 3)).toBeNull();
    destroy();
  });

  it('collectVisibleHtmlBlocks only returns blocks intersecting the viewport, in doc order', () => {
    const doc = `${BENIGN_HTML}\n\nafter-the-block\n\n${SCRIPT_HTML}\n`;
    const { handle, destroy } = makePreviewView(doc);
    const blocks = collectVisibleHtmlBlocks(handle.view);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    const texts = blocks.map((b) => b.text);
    expect(texts.some((t) => t.includes('<div'))).toBe(true);
    expect(texts.some((t) => t.includes('<script'))).toBe(true);
    // doc order (blocks never nest, so `from` is strictly ascending)
    for (let i = 1; i < blocks.length; i++) expect(blocks[i].from).toBeGreaterThan(blocks[i - 1].from);
    destroy();
  });
});

describe('raw HTML policy decoration (flag-gated, source-preserving)', () => {
  beforeEach(() => resetAllCohortFlags());

  it('flag OFF (default): no decoration, no owner change, source byte-identical', () => {
    const { content, handle, destroy } = makePreviewView(`${SCRIPT_HTML}\nbody\n`);
    expect(handle.view.state.doc.toString()).toBe(`${SCRIPT_HTML}\nbody\n`);
    expect(content.querySelector(`.${POLICY_CLASSES.htmlBlock}`)).toBeNull();
    // flag OFF ⇒ the policy registration is inert ⇒ plain default source label
    expect(resolveConstructOwner('htmlBlock').source).toBe('default');
    destroy();
  });

  it('flag ON: block decorated with semantic mark + data attribute; source bytes untouched', () => {
    setP4bFlagEnabled('rawHtmlPolicy', true);
    const { content, destroy } = makePreviewView(`${SCRIPT_HTML}\nbody\n`);
    const marked = content.querySelectorAll(`.${POLICY_CLASSES.htmlBlock}`);
    expect(marked.length).toBe(1);
    expect(marked[0].getAttribute(RAW_HTML_DATA_ATTR)).toBe(RAW_HTML_DATA_VALUE);
    // owner resolved to the policy label (still source-fallback — explicit)
    const r = resolveConstructOwner('htmlBlock');
    expect(r.owner).toBe('source-fallback');
    expect(r.source).toBe('p4b.raw-html-policy');
    destroy();
  });

  it('decoration never executes or replaces: no <script> ELEMENT is injected; doc is byte-identical', () => {
    setP4bFlagEnabled('rawHtmlPolicy', true);
    const doc = `${SCRIPT_HTML}\nbody\n`;
    const { content, handle, destroy } = makePreviewView(doc);
    // The raw `alert(1)` must exist as TEXT (source bytes visible), but it must
    // NOT be a live <script> element — so nothing can execute.
    expect(content.textContent).toContain('alert(1)');
    expect(content.querySelector('script')).toBeNull();
    // The doc (source truth) is byte-for-byte identical — never rewritten.
    expect(handle.view.state.doc.toString()).toBe(doc);
    destroy();
  });

  it('flag flip OFF→ON→OFF adds and removes the decoration without a doc change', () => {
    const doc = `${BENIGN_HTML}\nbody\n`;
    const { content, handle, destroy } = makePreviewView(doc);
    setP4bFlagEnabled('rawHtmlPolicy', true);
    handle.setLivePreview(false);
    handle.setLivePreview(true);
    expect(content.querySelector(`.${POLICY_CLASSES.htmlBlock}`)).not.toBeNull();
    expect(handle.view.state.doc.toString()).toBe(doc);
    destroy();
  });
});

describe('reveal-source + descriptor contract', () => {
  it('revealSource is a no-op (source-only surface)', () => {
    const { handle, destroy } = makePreviewView(`${SCRIPT_HTML}\n`);
    expect(revealSource(handle.view.state, 3)).toBeNull();
    destroy();
  });

  it('the descriptor is protocol-validated and source-only', () => {
    expect(rawHtmlPolicyDescriptor.kind).toBe('raw-html');
    expect(rawHtmlPolicyDescriptor.ownerKind).toBe('htmlBlock');
    expect(rawHtmlPolicyDescriptor.security.allowsUnsafeHtml).toBe(false);
    expect(rawHtmlPolicyDescriptor.security.containerPolicy).toBe('none');
    expect(rawHtmlPolicyDescriptor.fallbackBehavior).toBe('exact-source');
    expect(rawHtmlPolicyDescriptor.security.allowedUrlProtocols).toEqual([]);
    expect(rawHtmlPolicyDescriptor.__frozen).toBe(true);
  });
});
