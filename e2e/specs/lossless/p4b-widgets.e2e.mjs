import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { openFileInTree } from '../../page-objects/app.mjs';

const WORKSPACE = process.env.MARKFLOW_E2E_WORKSPACE;
const ARTIFACT_DIR = process.env.MARKFLOW_E2E_ARTIFACT_DIR;

async function openLossless(name) {
  await openFileInTree(name);
  await browser.waitUntil(async () => (await browser.execute((n) => {
    const p = window.__markflowStore?.getState()?.activeFilePath ?? '';
    return p.endsWith(`/${n}`);
  }, name)), { timeout: 10_000 });
  await browser.waitUntil(async () => await browser.execute(() => window.__markflowLossless?.isActive?.() === true), { timeout: 10_000 });
  await browser.execute(() => window.__markflowLossless?.setMode?.('preview'));
  await browser.waitUntil(async () => await browser.execute(() => window.__markflowLossless?.getMode?.() === 'preview'), { timeout: 5_000 });
}

async function sourceText() {
  return browser.execute(() => {
    const content = document.querySelector('.source-editor-wrapper .cm-content');
    return content?.cmTile?.view?.state.doc.toString() ?? '';
  });
}

// P4B 的 source-based clipboard 合同此前只有一条证据：fence widget 的显式 copy 按钮
// 写入 source（`__p4bCopied === 'const x = 1;'`）。基于**选区**的 copy/cut 的
// clipboard 载荷从未被回读过——CodeMirror 的 handlers.copy 走 copiedRange() → sliceDoc()，
// 所以「结构上必然产出 source」，但推理不是证据，而 P6 的
// `specs/typora-wysiwyg-editing/spec.md:62`「复制隐藏内容」场景直接依赖这个合同。
// 这里用合成 ClipboardEvent + DataTransfer 走 CodeMirror 真实的 copy/cut handler 并回读载荷。
async function clipboardRoundTrip(type, from, to) {
  await browser.execute(([f, t]) => {
    const el = document.querySelector('.source-editor-wrapper .cm-content');
    const view = el?.cmTile?.view ?? el?.cmView?.view ?? null;
    view.focus();
    view.dispatch({ selection: { anchor: f, head: t } });
  }, [from, to]);
  // handlers.copy/cut 的前置条件是 hasSelection(view.contentDOM, observer.selectionRange)，
  // 即 DOM 选区的 anchorNode 必须落在 contentDOM 内。DOM 选区由 observer 异步同步，
  // 未同步时 handler 会静默 return false 且不写 clipboardData —— 必须等，否则测的是 harness。
  await browser.waitUntil(async () => await browser.execute(() => {
    const el = document.querySelector('.source-editor-wrapper .cm-content');
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !sel.anchorNode) return false;
    return el.contains(sel.anchorNode);
  }), { timeout: 5_000, timeoutMsg: `DOM selection never synced inside .cm-content before ${type}` });
  return browser.execute((eventType) => {
    const el = document.querySelector('.source-editor-wrapper .cm-content');
    const view = el?.cmTile?.view ?? el?.cmView?.view ?? null;
    if (!view) return { ok: false, reason: 'no-view' };
    if (typeof DataTransfer !== 'function') return { ok: false, reason: 'no-DataTransfer' };
    const range = view.state.selection.main;
    const expected = view.state.doc.sliceString(range.from, range.to);
    const dt = new DataTransfer();
    const event = new ClipboardEvent(eventType, { bubbles: true, cancelable: true, clipboardData: dt });
    el.dispatchEvent(event);
    // CodeMirror 的 doc 是不可变对象：cut 的 dispatch 会产生一个新的 Text，
    // `view.state.doc` 指向新对象。这里必须重新读取 view.state —— 若沿用
    // dispatch 前捕获的引用，读到的是裁剪前的内容，断言会自欺欺人地通过。
    return {
      ok: true,
      defaultPrevented: event.defaultPrevented,
      payload: dt.getData('text/plain'),
      expected,
      domText: el.textContent,
      selection: { from: range.from, to: range.to },
      docAfter: view.state.doc.toString(),
    };
  }, type);
}

async function refreshProjection() {
  await browser.execute(() => {
    const b = window.__markflowLossless;
    if (b?.caret) b.caret(0);
  });
  await browser.pause(100);
}

async function setFlag(name, value) {
  const result = await browser.execute(([n, v]) => window.__setP4bFlag?.set?.(n, v) ?? false, [name, value]);
  if (result !== true) throw new Error(`cannot set P4B flag ${name}`);
  await refreshProjection();
}

async function fixtureBytes(name) {
  return readFile(path.join(WORKSPACE, name));
}

async function enableBaseFlags() {
  for (const key of ['__setLosslessCoreSession', '__setLivePreview']) {
    const result = await browser.execute((name) => {
      const setter = window[name];
      if (!setter) return 'no-hook';
      setter(true);
      return 'enabled';
    }, key);
    if (result !== 'enabled') throw new Error(`cannot enable ${key}`);
  }
}

async function captureWidgetThemeMatrix(selector, artifactPrefix) {
  const original = await browser.execute(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    zoom: document.body.style.zoom,
  }));
  const snapshots = [];
  try {
    await browser.execute(() => { document.body.style.zoom = '2'; });
    for (const theme of ['light', 'dark', 'sepia']) {
      await browser.execute((nextTheme) => {
        document.documentElement.setAttribute('data-theme', nextTheme);
      }, theme);
      await browser.pause(80);
      snapshots.push(await browser.execute(({ widgetSelector, currentTheme }) => {
        const root = document.documentElement;
        const el = document.querySelector(widgetSelector);
        const rect = el?.getBoundingClientRect();
        return {
          theme: currentTheme,
          visible: !!el && rect.width > 0 && rect.height > 0,
          bounded: !!rect && rect.left >= 0 && rect.top >= 0
            && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight,
          foreground: getComputedStyle(root).getPropertyValue('--fg').trim(),
          osReducedMotionObserved: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          osHighContrastObserved: window.matchMedia('(prefers-contrast: more)').matches,
        };
      }, { widgetSelector: selector, currentTheme: theme }));
      if (ARTIFACT_DIR) {
        await browser.saveScreenshot(path.join(ARTIFACT_DIR, `${artifactPrefix}-${theme}-css-zoom-200.png`));
      }
    }
  } finally {
    await browser.execute(({ theme, zoom }) => {
      if (theme === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', theme);
      document.body.style.zoom = zoom;
    }, original);
  }
  return snapshots;
}

async function saveRestoredSource(name, expectedBytes) {
  const result = await browser.execute(() => window.__markflowLossless?.save?.(false) ?? 'no-hook');
  expect(['saved', 'skipped']).toContain(result);
  await browser.waitUntil(async () => await browser.execute(
    () => window.__markflowLossless?.isDirty?.() === false,
  ), { timeout: 10_000, timeoutMsg: `expected ${name} clean after saving restored source` });
  expect(await fixtureBytes(name)).toEqual(expectedBytes);
}

export function registerP4bWidgetTests() {
  describe('P4B widgets and policy desktop semantic contract', () => {
    before(async () => {
      await enableBaseFlags();
    });

    afterEach(async () => {
      await browser.execute(() => {
        for (const n of ['taskCheckbox', 'codeFenceControls', 'frontmatterPolicy', 'rawHtmlPolicy']) {
          window.__setP4bFlag?.set?.(n, false);
        }
        window.__p4bWidgets?.fail?.('none');
        window.__markflowLossless?.setReadOnly?.(false);
        if (Object.prototype.hasOwnProperty.call(navigator, 'clipboard')) {
          delete navigator.clipboard;
        }
        delete window.__p4bCopied;
        delete window.__markflowDocumentExportCapture;
        delete window.__p4bDocumentExports;
      });
    });

    it('task checkbox flag OFF/ON exposes DOM + ARIA and Space toggles one local patch', async () => {
      await openLossless('p4b-widget-task.md');
      await setFlag('taskCheckbox', false);
      expect(await browser.execute(() => window.__p4bWidgets?.taskCount?.() ?? -1)).toBe(0);
      expect(await browser.execute(() => window.__markflowProjection?.ownerRegistry?.().owners.listItem)).toBe('local');
      expect(await browser.execute(() => window.__markflowProjection?.ownerRegistry?.().owners.taskCheckbox)).toBe('source-fallback');

      await setFlag('taskCheckbox', true);
      await browser.waitUntil(async () => await browser.execute(() => (window.__p4bWidgets?.taskCount?.() ?? 0) > 0), { timeout: 5_000 });
      expect(await browser.execute(() => window.__markflowProjection?.ownerRegistry?.().owners.listItem)).toBe('local');
      expect(await browser.execute(() => window.__markflowProjection?.ownerRegistry?.().owners.taskCheckbox)).toBe('widget');
      const checkbox = await $('.mf-widget-task');
      expect(await checkbox.getAttribute('role')).toBe('checkbox');
      expect(await checkbox.getAttribute('aria-label')).toContain('widget task');
      expect(await checkbox.getAttribute('aria-checked')).toBe('false');
      const originalBytes = await fixtureBytes('p4b-widget-task.md');
      const before = await sourceText();
      await browser.execute(() => document.querySelector('.mf-widget-task')?.focus());
      await browser.keys(['Space']);
      await browser.waitUntil(async () => (await sourceText()).includes('- [x] widget task 🚀'), { timeout: 5_000 });
      const patched = await sourceText();
      expect(patched).toBe(before.replace('[ ]', '[x]'));
      await browser.keys(['Meta', 'z']);
      await browser.waitUntil(async () => (await sourceText()) === before, { timeout: 5_000 });
      await saveRestoredSource('p4b-widget-task.md', originalBytes);
    });

    it('task checkbox read-only is disabled and cannot change source', async () => {
      await openLossless('p4b-widget-task.md');
      await setFlag('taskCheckbox', true);
      const before = await sourceText();
      expect(await browser.execute(() => window.__markflowLossless?.setReadOnly?.(true) ?? 'no-hook')).toBe('set');
      await browser.waitUntil(async () => await browser.execute(() => document.querySelector('.mf-widget-task')?.getAttribute('aria-disabled') === 'true'), { timeout: 5_000 });
      await browser.execute(() => document.querySelector('.mf-widget-task')?.focus());
      await browser.keys(['Space']);
      await browser.pause(200);
      expect(await sourceText()).toBe(before);
    });

    it('fence controls flag OFF/ON show badge and copy; language is a local patch with Undo', async () => {
      await openLossless('p4b-widget-fence.md');
      await setFlag('codeFenceControls', false);
      expect(await browser.execute(() => window.__p4bWidgets?.fenceCount?.() ?? -1)).toBe(0);
      expect(await browser.execute(() => window.__markflowProjection?.ownerRegistry?.().owners.fence)).toBe('local');
      expect(await browser.execute(() => window.__markflowProjection?.ownerRegistry?.().owners.codeFenceControls)).toBe('source-fallback');
      await setFlag('codeFenceControls', true);
      await browser.waitUntil(async () => await browser.execute(() => (window.__p4bWidgets?.fenceCount?.() ?? 0) === 1), { timeout: 5_000 });
      expect(await browser.execute(() => window.__markflowProjection?.ownerRegistry?.().owners.fence)).toBe('local');
      expect(await browser.execute(() => window.__markflowProjection?.ownerRegistry?.().owners.codeFenceControls)).toBe('widget');
      expect(await $('.mf-widget-fence-badge').getAttribute('data-language')).toBe('js');
      expect(await $('.mf-widget-fence').getAttribute('role')).toBe('region');
      expect(await $('.mf-widget-fence').getAttribute('aria-label')).toContain('代码块');
      const originalBytes = await fixtureBytes('p4b-widget-fence.md');
      const before = await sourceText();
      expect(await browser.execute(() => {
        try {
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
              writeText(text) {
                window.__p4bCopied = text;
                return Promise.resolve();
              },
            },
          });
          return 'installed';
        } catch (error) {
          return `failed:${String(error)}`;
        }
      })).toBe('installed');
      await $('.mf-widget-fence-copy').click();
      await browser.waitUntil(async () => await browser.execute(() => window.__p4bCopied === 'const x = 1;'), { timeout: 5_000 });
      expect(await sourceText()).toBe(before);
      await $('.mf-widget-fence-lang').click();
      await browser.waitUntil(async () => (await sourceText()).includes('```ts title="keep"'), { timeout: 5_000 });
      expect((await sourceText()).replace('```ts', '```js')).toBe(before);
      await browser.keys(['Meta', 'z']);
      await browser.waitUntil(async () => (await sourceText()) === before, { timeout: 5_000 });
      await saveRestoredSource('p4b-widget-fence.md', originalBytes);
    });

    it('selection copy on the rendered surface yields exact Markdown source, not DOM text', async () => {
      await openLossless('p4b-widget-fence.md');
      await setFlag('codeFenceControls', true);
      const before = await sourceText();
      const originalBytes = await fixtureBytes('p4b-widget-fence.md');

      const copy = await clipboardRoundTrip('copy', 0, before.length);
      expect(copy.ok).toBe(true);
      // defaultPrevented 证明是 CodeMirror 的 handlers.copy 接管了事件并写入 clipboardData；
      // 若为 false 说明 handler 没跑，payload 为空，后面的相等断言就毫无意义。
      expect(copy.defaultPrevented).toBe(true);
      expect(copy.payload).toBe(before);
      expect(copy.payload).toBe(copy.expected);
      expect(copy.payload).toContain('```js title="keep"');
      expect(copy.payload).toContain('const x = 1;');
      // 渲染 DOM 里带着 widget chrome（badge「js」、按钮「复制」/「语言」），
      // 这些文案绝不能进入 clipboard payload —— 这是「不是从 DOM 取的」的实证。
      expect(copy.domText).toContain('复制');
      expect(copy.domText).not.toBe(copy.payload);

      expect(await sourceText()).toBe(before);
      expect((await fixtureBytes('p4b-widget-fence.md')).equals(originalBytes)).toBe(true);
    });

    it('selection cut payload is source, removes the range, and one Undo restores bytes', async () => {
      await openLossless('p4b-widget-fence.md');
      await setFlag('codeFenceControls', true);
      const before = await sourceText();
      const originalBytes = await fixtureBytes('p4b-widget-fence.md');
      const body = 'const x = 1;\n';
      const from = before.indexOf(body);
      expect(from).toBeGreaterThan(0);

      // cut 会真的改动文档，所以还原必须放在 finally 里、断言之前完成：
      // 若断言先跑并在中途抛出，文档会一直保持被裁剪状态，后续用例将在残缺
      // 文档上执行并级联失败（已实测：一次断言失败拖垮 fence keyboard-only
      // 与 HTML export 两条用例）。先安全还原，再断言已捕获的结果。
      let cut;
      try {
        cut = await clipboardRoundTrip('cut', from, from + body.length);
      } finally {
        await browser.keys(['Meta', 'z']);
        await browser.waitUntil(async () => (await sourceText()) === before, { timeout: 5_000 });
        await saveRestoredSource('p4b-widget-fence.md', originalBytes);
      }

      expect(cut.ok).toBe(true);
      expect(cut.defaultPrevented).toBe(true);
      expect(cut.payload).toBe(body);
      expect(cut.docAfter).toBe(before.slice(0, from) + before.slice(from + body.length));
      expect(cut.docAfter).not.toContain(body);
    });

    it('fence language control is absent in read-only and cannot change source', async () => {
      await openLossless('p4b-widget-fence.md');
      await setFlag('codeFenceControls', true);
      const before = await sourceText();
      expect(await browser.execute(() => window.__markflowLossless?.setReadOnly?.(true) ?? 'no-hook')).toBe('set');
      await browser.waitUntil(async () => await browser.execute(() => document.querySelector('.mf-widget-fence')?.getAttribute('role') === 'region'), { timeout: 5_000 });
      expect(await browser.execute(() => document.querySelector('.mf-widget-fence-lang') === null)).toBe(true);
      expect(await sourceText()).toBe(before);
    });

    it('fence controls keyboard-only activation is accessible and fail-safe', async () => {
      await openLossless('p4b-widget-fence.md');
      await setFlag('codeFenceControls', true);
      const before = await sourceText();
      const originalBytes = await fixtureBytes('p4b-widget-fence.md');
      await browser.execute(() => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText(text) { window.__p4bCopied = text; return Promise.resolve(); } },
        });
        document.querySelector('.mf-widget-fence-copy')?.focus();
      });
      expect(await browser.execute(() => document.activeElement?.getAttribute('data-action'))).toBe('copy');
      await browser.keys(['Enter']);
      await browser.waitUntil(async () => await browser.execute(() => window.__p4bCopied === 'const x = 1;'), { timeout: 5_000 });
      await browser.keys(['Space']);
      await browser.waitUntil(async () => await browser.execute(() => window.__p4bCopied === 'const x = 1;'), { timeout: 5_000 });
      expect(await sourceText()).toBe(before);

      await browser.execute(() => document.querySelector('.mf-widget-fence-lang')?.focus());
      expect(await browser.execute(() => document.activeElement?.getAttribute('data-action'))).toBe('language');
      for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape', 'Backspace', 'Delete']) {
        await browser.keys([key]);
      }
      expect(await sourceText()).toBe(before);
      await browser.keys(['Enter']);
      await browser.waitUntil(async () => (await sourceText()).includes('```ts title="keep"'), { timeout: 5_000 });
      await browser.keys(['Meta', 'z']);
      await browser.waitUntil(async () => (await sourceText()) === before, { timeout: 5_000 });
      await saveRestoredSource('p4b-widget-fence.md', originalBytes);
    });

    it('widget failure injection falls back to exact source and flag rollback removes controls', async () => {
      await openLossless('p4b-widget-fence.md');
      const before = await sourceText();
      await setFlag('codeFenceControls', true);
      await browser.execute(() => window.__p4bWidgets?.fail?.('always'));
      await refreshProjection();
      expect(await sourceText()).toBe(before);
      expect(await browser.execute(() => window.__p4bWidgets?.fenceCount?.() ?? -1)).toBe(0);
      await browser.execute(() => window.__p4bWidgets?.fail?.('none'));
      await setFlag('codeFenceControls', false);
      expect(await sourceText()).toBe(before);
    });

    it('raw HTML is source-only by default and remains non-executable; policy flag rollback is inert', async () => {
      await openLossless('p4b-policy-html.md');
      const before = await sourceText();
      expect(await browser.execute(() => window.__p4bExecuted === true)).toBe(false);
      expect(await browser.execute(() => document.querySelector('[data-raw-html-policy]') !== null)).toBe(false);
      expect(await browser.execute(() => document.querySelector('.cm-content script') !== null)).toBe(false);
      await setFlag('rawHtmlPolicy', true);
      expect(await sourceText()).toBe(before);
      expect(await browser.execute(() => document.querySelector('.mf-html-block') !== null)).toBe(true);
      await setFlag('rawHtmlPolicy', false);
      expect(await browser.execute(() => document.querySelector('.mf-html-block') !== null)).toBe(false);
      expect(await sourceText()).toBe(before);
    });

    it('FrontMatter parser gap uses exact-source fallback and preserves bytes', async () => {
      await openLossless('p4b-policy-frontmatter.md');
      const before = await fixtureBytes('p4b-policy-frontmatter.md');
      const text = await sourceText();
      expect(Buffer.from(text).equals(before)).toBe(true);
      await setFlag('frontmatterPolicy', true);
      expect(await sourceText()).toBe(text);
      expect(await fixtureBytes('p4b-policy-frontmatter.md')).toEqual(before);
      expect(await browser.execute(() => document.querySelector('.mf-widget-task, .mf-widget-fence, .mf-html-block') !== null)).toBe(false);
    });

    it('keyboard-only task navigation is fail-safe: supported keys commit, editing keys never leak', async () => {
      await openLossless('p4b-widget-task.md');
      await setFlag('taskCheckbox', true);
      const before = await sourceText();
      const originalBytes = await fixtureBytes('p4b-widget-task.md');
      await browser.execute(() => document.querySelector('.mf-widget-task')?.focus());
      expect(await browser.execute(() => document.activeElement?.getAttribute('role'))).toBe('checkbox');
      for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Backspace', 'Delete', 'Escape']) {
        await browser.keys([key]);
      }
      expect(await sourceText()).toBe(before);
      await browser.keys(['Enter']);
      await browser.waitUntil(async () => (await sourceText()).includes('- [x] widget task 🚀'), { timeout: 5_000 });
      await browser.keys(['Meta', 'z']);
      await browser.waitUntil(async () => (await sourceText()) === before, { timeout: 5_000 });
      await saveRestoredSource('p4b-widget-task.md', originalBytes);
    });

    it('Source↔Preview roundtrip preserves source, shared history, dirty state, and file bytes', async () => {
      await openLossless('p4b-widget-task.md');
      await setFlag('taskCheckbox', true);
      const beforeText = await sourceText();
      const beforeBytes = await fixtureBytes('p4b-widget-task.md');
      await browser.execute(() => window.__markflowLossless?.setMode?.('source'));
      await browser.waitUntil(async () => await browser.execute(() => window.__markflowLossless?.getMode?.() === 'source'), { timeout: 5_000 });
      await browser.execute(() => window.__markflowLossless?.setMode?.('preview'));
      await browser.waitUntil(async () => await browser.execute(() => window.__markflowLossless?.getMode?.() === 'preview'), { timeout: 5_000 });
      expect(await sourceText()).toBe(beforeText);
      await browser.execute(() => document.querySelector('.mf-widget-task')?.focus());
      await browser.keys(['Space']);
      await browser.waitUntil(async () => await browser.execute(() => window.__markflowLossless?.isDirty?.() === true), { timeout: 5_000 });
      await browser.keys(['Meta', 'z']);
      await browser.waitUntil(async () => await browser.execute(() => window.__markflowLossless?.isDirty?.() === false), { timeout: 5_000 });
      expect(await sourceText()).toBe(beforeText);
      expect((await fixtureBytes('p4b-widget-task.md')).equals(beforeBytes)).toBe(true);
    });

    it('three product themes and synthetic 200% CSS-zoom stress keep widgets visible and focusable', async () => {
      await openLossless('p4b-widget-task.md');
      await setFlag('taskCheckbox', true);
      const taskResult = await captureWidgetThemeMatrix('.mf-widget-task', 'p4b-task');
      expect(taskResult).toEqual([
        { theme: 'light', visible: true, bounded: true, foreground: '#1A1A1A', osReducedMotionObserved: expect.any(Boolean), osHighContrastObserved: expect.any(Boolean) },
        { theme: 'dark', visible: true, bounded: true, foreground: '#E8E8E8', osReducedMotionObserved: expect.any(Boolean), osHighContrastObserved: expect.any(Boolean) },
        { theme: 'sepia', visible: true, bounded: true, foreground: '#5C4B37', osReducedMotionObserved: expect.any(Boolean), osHighContrastObserved: expect.any(Boolean) },
      ]);
      await browser.execute(() => document.querySelector('.mf-widget-task')?.focus());
      expect(await browser.execute(() => document.activeElement?.classList.contains('mf-widget-task'))).toBe(true);

      await openLossless('p4b-widget-fence.md');
      await setFlag('codeFenceControls', true);
      const fenceResult = await captureWidgetThemeMatrix('.mf-widget-fence', 'p4b-fence');
      expect(fenceResult.map(({ theme, visible, bounded, foreground }) => ({ theme, visible, bounded, foreground }))).toEqual([
        { theme: 'light', visible: true, bounded: true, foreground: '#1A1A1A' },
        { theme: 'dark', visible: true, bounded: true, foreground: '#E8E8E8' },
        { theme: 'sepia', visible: true, bounded: true, foreground: '#5C4B37' },
      ]);
      await browser.execute(() => document.querySelector('.mf-widget-fence-copy')?.focus());
      expect(await browser.execute(() => document.activeElement?.getAttribute('data-action'))).toBe('copy');
    });

    it('preview projection can be disposed/recreated and cleanup leaves no widget flag residue', async () => {
      await openLossless('p4b-widget-fence.md');
      await setFlag('codeFenceControls', true);
      await browser.waitUntil(async () => await browser.execute(() => (window.__p4bWidgets?.fenceCount?.() ?? 0) === 1), { timeout: 5_000 });
      await browser.execute(() => window.__markflowLossless?.setMode?.('source'));
      await browser.waitUntil(async () => await browser.execute(() => (window.__p4bWidgets?.fenceCount?.() ?? 0) === 0), { timeout: 5_000 });
      await browser.execute(() => window.__markflowLossless?.setMode?.('preview'));
      await browser.waitUntil(async () => await browser.execute(() => (window.__p4bWidgets?.fenceCount?.() ?? 0) === 1), { timeout: 5_000 });
      await setFlag('codeFenceControls', false);
      expect(await browser.execute(() => window.__p4bWidgets?.fenceCount?.() ?? -1)).toBe(0);
      expect(await browser.execute(() => window.__setP4bFlag?.isOn?.('codeFenceControls') ?? true)).toBe(false);
    });

    it('toolbar HTML export uses lossless source and never serializes widget DOM', async () => {
      await browser.execute(() => {
        window.__p4bDocumentExports = [];
        window.__markflowDocumentExportCapture = async (payload) => {
          window.__p4bDocumentExports.push(payload);
          return true;
        };
      });

      await openLossless('p4b-widget-task.md');
      await setFlag('taskCheckbox', true);
      const taskSource = await sourceText();
      const taskBytes = await fixtureBytes('p4b-widget-task.md');
      await browser.execute(() => {
        document.getElementById('btn-export')?.click();
        const html = [...document.querySelectorAll('.context-menu-item')]
          .find((item) => item.textContent?.includes('HTML'));
        html?.click();
      });
      await browser.waitUntil(async () => await browser.execute(() => (window.__p4bDocumentExports?.length ?? 0) === 1), { timeout: 10_000 });

      await openLossless('p4b-widget-fence.md');
      await setFlag('codeFenceControls', true);
      const fenceSource = await sourceText();
      const fenceBytes = await fixtureBytes('p4b-widget-fence.md');
      await browser.execute(() => {
        document.getElementById('btn-export')?.click();
        const html = [...document.querySelectorAll('.context-menu-item')]
          .find((item) => item.textContent?.includes('HTML'));
        html?.click();
      });
      await browser.waitUntil(async () => await browser.execute(() => (window.__p4bDocumentExports?.length ?? 0) === 2), { timeout: 10_000 });

      const exports = await browser.execute(() => window.__p4bDocumentExports);
      expect(exports).toHaveLength(2);
      expect(exports[0].defaultName).toBe('p4b-widget-task.html');
      expect(exports[0].content).toContain('widget task');
      expect(exports[1].defaultName).toBe('p4b-widget-fence.html');
      expect(exports[1].content).toContain('const x = 1;');
      for (const item of exports) {
        expect(item.content).not.toContain('mf-widget');
        expect(item.content).not.toContain('data-mf-widget');
        expect(item.content).not.toContain('mf-widget-fence-copy');
      }
      expect(await sourceText()).toBe(fenceSource);
      expect((await fixtureBytes('p4b-widget-task.md')).equals(taskBytes)).toBe(true);
      expect((await fixtureBytes('p4b-widget-fence.md')).equals(fenceBytes)).toBe(true);
      expect(taskSource).toContain('- [ ] widget task');
    });
  });
}
