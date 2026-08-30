// Human-acceptance items 4-6:
//   4. visuals meet the "default-on" bar
//   5. screen reader / keyboard-only reachable
//   6. high-risk widget (raw HTML) security behaviour
//
// NOTE recorded in the report: every P4B flag hook is gated on
// `import.meta.env.MODE === 'e2e'`, so the ON states captured here exist ONLY
// in this e2e-mode debug binary. No shippable build can reach them.

import {
  enableBaseFlags, hidKeys, openDoc, record, refreshProjection,
  setFlag, shot, sourceText, dumpFindings,
} from '../lib.mjs';

async function focusedElement() {
  return browser.execute(() => {
    const el = document.activeElement;
    if (!el) return null;
    return {
      tag: el.tagName,
      cls: el.className?.toString?.() ?? '',
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      dataAction: el.getAttribute('data-action'),
      tabindex: el.getAttribute('tabindex'),
      outline: getComputedStyle(el).outlineWidth + ' ' + getComputedStyle(el).outlineStyle,
    };
  });
}

async function widgetAria(selector) {
  return browser.execute((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      ariaChecked: el.getAttribute('aria-checked'),
      ariaDisabled: el.getAttribute('aria-disabled'),
      tabindex: el.getAttribute('tabindex'),
      text: el.textContent,
      box: { w: Math.round(r.width), h: Math.round(r.height) },
      contrastFg: s.color,
      background: s.backgroundColor,
      fontSize: s.fontSize,
    };
  }, selector);
}

async function themeShots(prefix, selector) {
  const out = [];
  for (const theme of ['light', 'dark', 'sepia']) {
    await browser.execute((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await browser.pause(300);
    const metrics = await widgetAria(selector);
    await browser.saveScreenshot(`/tmp/p4b-acc/shots/${prefix}-${theme}.png`);
    await (await $('.source-editor-wrapper')).saveScreenshot(`/tmp/p4b-acc/shots/${prefix}-${theme}-editor.png`);
    out.push({ theme, metrics });
  }
  await browser.execute(() => document.documentElement.setAttribute('data-theme', 'light'));
  await browser.pause(200);
  return out;
}

describe('P4B human acceptance — visuals, keyboard-only, raw HTML', () => {
  before(async () => {
    await enableBaseFlags();
  });

  afterEach(async () => {
    // Keep dirty state from leaking across visual tests.
    await browser.execute(() => window.__markflowLossless?.save?.(false)).catch(() => {});
    await browser.waitUntil(async () => await browser.execute(
      () => window.__markflowLossless?.isDirty?.() === false,
    ), { timeout: 5_000 }).catch(() => {});
  });

  it('item 4 — task checkbox visuals across the three product themes', async () => {
    await openDoc('p4b-widget-task.md');
    await setFlag('taskCheckbox', true);
    await browser.waitUntil(async () => await browser.execute(() => (window.__p4bWidgets?.taskCount?.() ?? 0) > 0), { timeout: 5_000 });
    const shots = await themeShots('12-item4-task', '.mf-widget-task');
    record('item4.task.themeMetrics', shots);
    record('item4.task.aria', await widgetAria('.mf-widget-task'));
    await shot('13-item4-task-full-window');
    expect(shots.every((s) => s.metrics && s.metrics.box.w > 0 && s.metrics.box.h > 0)).toBe(true);
  });

  it('item 4 — code fence controls visuals across the three product themes', async () => {
    await openDoc('p4b-widget-fence.md');
    await setFlag('codeFenceControls', true);
    await browser.waitUntil(async () => await browser.execute(() => (window.__p4bWidgets?.fenceCount?.() ?? 0) === 1), { timeout: 5_000 });
    const shots = await themeShots('14-item4-fence', '.mf-widget-fence');
    record('item4.fence.themeMetrics', shots);
    record('item4.fence.aria', await widgetAria('.mf-widget-fence'));
    record('item4.fence.badge', await widgetAria('.mf-widget-fence-badge'));
    record('item4.fence.copyButton', await widgetAria('.mf-widget-fence-copy'));
    await shot('15-item4-fence-full-window');
    expect(shots.every((s) => s.metrics && s.metrics.box.w > 0)).toBe(true);
  });

  it('item 4 — frontmatter and raw HTML policy visuals', async () => {
    await openDoc('p4b-policy-frontmatter.md');
    await setFlag('frontmatterPolicy', true);
    await browser.pause(400);
    record('item4.frontmatter.aria', await widgetAria('.mf-frontmatter, .mf-widget-frontmatter, [data-frontmatter]'));
    await shot('16-item4-frontmatter');
    await (await $('.source-editor-wrapper')).saveScreenshot('/tmp/p4b-acc/shots/17-item4-frontmatter-editor.png');

    await openDoc('p4b-policy-html.md');
    await setFlag('rawHtmlPolicy', true);
    await browser.waitUntil(async () => await browser.execute(() => document.querySelector('.mf-html-block') !== null), { timeout: 5_000 });
    record('item4.rawHtml.block', await widgetAria('.mf-html-block'));
    await shot('18-item4-rawhtml-policy-on');
    await (await $('.source-editor-wrapper')).saveScreenshot('/tmp/p4b-acc/shots/19-item4-rawhtml-policy-on-editor.png');
    await setFlag('rawHtmlPolicy', false);
    await browser.pause(300);
    await shot('20-item4-rawhtml-policy-off');
  });

  it('item 5 — keyboard-only: how far does real Tab travel from the editor?', async () => {
    await openDoc('p4b-widget-task.md');
    await setFlag('taskCheckbox', true);
    await (await $('.source-editor-wrapper .cm-content')).click();
    await browser.pause(300);
    record('item5.startFocus', await focusedElement());

    const walk = [];
    for (let i = 0; i < 10; i += 1) {
      hidKeys('Tab');
      await browser.pause(200);
      walk.push({ tab: i + 1, focus: await focusedElement() });
    }
    record('item5.tabWalk', walk);
    record('item5.reachedTaskWidgetByTab', walk.some((w) => (w.focus?.cls ?? '').includes('mf-widget-task')));
    await browser.saveScreenshot('/tmp/p4b-acc/shots/21-item5-tab-walk-end.png');

    // Programmatic focus is the only supported path today; verify what a
    // keyboard user gets once focus IS on the widget.
    await browser.execute(() => document.querySelector('.mf-widget-task')?.focus());
    await browser.pause(200);
    record('item5.widgetFocused', await focusedElement());
    const before = await sourceText();
    hidKeys('Space');
    await browser.pause(500);
    const afterSpace = await sourceText();
    record('item5.spaceToggledSource', afterSpace !== before);
    record('item5.docAfterSpace', afterSpace);
    hidKeys('cmd+z');
    await browser.pause(500);
    record('item5.undoRestored', (await sourceText()) === before);
    await browser.saveScreenshot('/tmp/p4b-acc/shots/22-item5-widget-focus-space.png');
    expect(afterSpace).not.toBe(before);
  });

  it('item 6 — raw HTML stays inert with the policy flag ON', async () => {
    await openDoc('p4b-policy-html.md');
    const before = await sourceText();
    record('item6.flagOff.scriptExecuted', await browser.execute(() => window.__p4bExecuted === true));
    record('item6.flagOff.scriptElementsInEditor', await browser.execute(() => document.querySelectorAll('.source-editor-wrapper script').length));
    record('item6.flagOff.htmlBlockPresent', await browser.execute(() => document.querySelector('.mf-html-block') !== null));

    await setFlag('rawHtmlPolicy', true);
    await browser.waitUntil(async () => await browser.execute(() => document.querySelector('.mf-html-block') !== null), { timeout: 5_000 });
    await browser.pause(600);
    const probe = await browser.execute(() => {
      const editor = document.querySelector('.source-editor-wrapper');
      return {
        scriptExecuted: window.__p4bExecuted === true,
        scriptElementsInEditor: editor ? editor.querySelectorAll('script').length : -1,
        divWithDataX: document.querySelectorAll('.source-editor-wrapper div[data-x]').length,
        liveDivs: [...document.querySelectorAll('div[data-x="1"]')].map((d) => d.textContent),
        htmlBlockCount: document.querySelectorAll('.mf-html-block').length,
        htmlBlockText: document.querySelector('.mf-html-block')?.textContent ?? null,
        editorText: document.querySelector('.source-editor-wrapper .cm-content')?.textContent ?? null,
      };
    });
    record('item6.flagOn', probe);
    record('item6.flagOn.sourceUnchanged', (await sourceText()) === before);
    await browser.saveScreenshot('/tmp/p4b-acc/shots/23-item6-rawhtml-inert.png');
    await (await $('.source-editor-wrapper')).saveScreenshot('/tmp/p4b-acc/shots/24-item6-rawhtml-inert-editor.png');

    expect(probe.scriptExecuted).toBe(false);
    expect(probe.scriptElementsInEditor).toBe(0);
    expect(probe.divWithDataX).toBe(0);
    expect((await sourceText())).toBe(before);
    await setFlag('rawHtmlPolicy', false);
  });

  after(async () => {
    await dumpFindings('/tmp/p4b-acc/findings-visual.json');
    for (const n of ['taskCheckbox', 'codeFenceControls', 'frontmatterPolicy', 'rawHtmlPolicy']) {
      await setFlag(n, false).catch(() => {});
    }
  });
});
