import path from 'node:path';
import { app, openFileInTree, openSettings, closeSettings, waitForAppReady } from '../../page-objects/app.mjs';

/**
 * Task-list WYSIWYG contract (change: task-list-checkbox-caret-spacing).
 *
 * Three defects share one root: the task-list CSS block. Coverage here is real
 * WebKit geometry, not source text:
 *   - the checkbox has an explicit 1em size that follows the body font size
 *     setting instead of the browser default,
 *   - an empty task item's content div is still wide, so WebKit can paint the
 *     caret there (a zero-width empty block is why the caret only appeared
 *     after typing the first character),
 *   - consecutive task items are spaced tighter than consecutive paragraphs
 *     (the item's own margin-bottom used to stack on the inner paragraph's).
 *
 * The embedded WebDriver's element.click() synthesises a click without browser
 * caret placement (see startup-caret.e2e.mjs), so the pointer path dispatches
 * its own mousedown/mouseup pair at the content box and, if the synthetic
 * events do not relocate the caret, applies the same coordinates through
 * ProseMirror's `posAtCoords`. That fallback is what actually runs (verified:
 * the synthetic events never move the WebKit caret), so this spec proves
 * coordinate mapping + keyboard movement, NOT OS-mouse caret paint. The paint
 * itself is covered by the native window screenshots in `e2e/artifacts/` plus
 * manual review.
 */

const FIXTURE = 'task-list-layout.md';
const NESTED_FIXTURE = 'task-list-nested-lists.md';
const ARTIFACT = (...parts) => path.join(process.cwd(), 'e2e', 'artifacts', ...parts);

const root = () => $('#wysiwyg-editor .tiptap');

/** Task list geometry snapshot: item boxes, checkbox/content boxes, and gaps. */
const taskListGeometry = () => browser.execute(() => {
  const surface = document.querySelector('#wysiwyg-editor .tiptap');
  const lists = [...surface.querySelectorAll('ul[data-type="taskList"]')];
  const topLevel = lists[0];
  const items = [...topLevel.children].filter((child) => child.tagName === 'LI');
  const children = [...surface.children];
  const paragraphs = children.filter((child) => child.tagName === 'P');

  const measure = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
      width: rect.width, height: rect.height,
    };
  };

  const describeItem = (li) => {
    const checkbox = li.querySelector('input[type="checkbox"]');
    const content = li.querySelector(':scope > div');
    return {
      checked: li.dataset.checked === 'true',
      text: content?.textContent ?? '',
      item: measure(li),
      checkbox: checkbox ? measure(checkbox) : null,
      content: content ? measure(content) : null,
    };
  };

  // Paragraph spacing baseline: ONLY between DOM-adjacent <p> siblings. A gap
  // that spans the list measures the whole list height (≈202px in this fixture)
  // and would drown out the real paragraph spacing.
  const adjacentParagraphGaps = children.flatMap((child, index) => {
    const previous = children[index - 1];
    if (!previous || previous.tagName !== 'P' || child.tagName !== 'P') return [];
    return [child.getBoundingClientRect().top - previous.getBoundingClientRect().bottom];
  });

  // Item spacing measured on the items' own paragraph boxes. A border box
  // excludes its own margin, so this whitespace is exactly
  // `li margin-bottom + inner p margin-bottom` — the sum this change collapses.
  const itemParagraphs = items.map((li) => li.querySelector(':scope > div > p'));
  const itemTextGaps = itemParagraphs.slice(1).flatMap((paragraph, index) => {
    const previous = itemParagraphs[index];
    if (!paragraph || !previous) return [];
    return [paragraph.getBoundingClientRect().top - previous.getBoundingClientRect().bottom];
  });

  const computed = (element, properties) => {
    if (!element) return null;
    const computedStyle = getComputedStyle(element);
    return Object.fromEntries(properties.map((property) => [property, computedStyle[property]]));
  };

  const style = getComputedStyle(surface);
  return {
    // Computed-style contract, independent of margin collapsing. Measured on the
    // non-empty item (index 1) so an empty paragraph box cannot skew the read.
    computedStyles: {
      item: computed(items[1], ['marginBottom']),
      itemParagraph: computed(itemParagraphs[1], ['marginBottom']),
      paragraph: computed(children.find((child) => child.tagName === 'P'), ['marginBottom']),
    },
    adjacentParagraphGaps,
    itemTextGaps,
    fontSize: parseFloat(style.fontSize),
    itemCount: items.length,
    items: items.map(describeItem),
    // Paragraph count only: the spacing baseline itself is measured through
    // `adjacentParagraphGaps` and `computedStyles.paragraph` below.
    paragraphCount: paragraphs.length,
    taskList: measure(topLevel),
    nested: lists[1]
      ? { items: [...lists[1].children].filter((child) => child.tagName === 'LI').map(describeItem) }
      : null,
    surface: measure(surface),
  };
});

/**
 * Nested-list margin snapshot: a task item may contain either a nested PLAIN
 * bullet/ordered list or a nested TASK list. Both are `li > div > ul`, so a rule
 * whose final selector is a bare `ul` hits the plain list too (the leak behind
 * change task-list-checkbox-caret-spacing round 2: it reported 0.25em / 4.5px
 * instead of the generic `.ProseMirror ul` 1em / 18px).
 */
const nestedListMargins = () => browser.execute(() => {
  const surface = document.querySelector('#wysiwyg-editor .tiptap');
  const topLevel = surface.querySelector('ul[data-type="taskList"]');
  const items = topLevel ? [...topLevel.children].filter((child) => child.tagName === 'LI') : [];
  const describe = (list) => {
    if (!list) return null;
    const style = getComputedStyle(list);
    return {
      dataType: list.getAttribute('data-type'),
      marginBottom: style.marginBottom,
      paddingLeft: style.paddingLeft,
      listStyleType: style.listStyleType,
      itemCount: [...list.children].filter((child) => child.tagName === 'LI').length,
      // Which top-level task item owns this list (pins the fixture shape).
      parentItemIndex: items.findIndex((li) => li.querySelector(':scope > div')?.contains(list)),
    };
  };
  return {
    fontSize: parseFloat(getComputedStyle(surface).fontSize),
    plain: describe(surface.querySelector('ul[data-type="taskList"] li > div > ul:not([data-type="taskList"])')),
    task: describe(surface.querySelector('ul[data-type="taskList"] ul[data-type="taskList"]')),
  };
});

/** Selection state of the editor, including the DOM range and its model position. */
const selectionState = () => browser.execute(() => {
  const surface = document.querySelector('#wysiwyg-editor .tiptap');
  const view = surface.editor.view;
  const dom = window.getSelection();
  const inside = (node) => Boolean(node) && surface.contains(node);
  const posOf = (node, offset) => {
    if (!inside(node)) return null;
    try {
      return view.posAtDOM(node, offset);
    } catch {
      return null;
    }
  };
  const range = dom.rangeCount > 0 ? dom.getRangeAt(0) : null;
  const anchorNode = range ? range.startContainer : null;
  const anchorElement = anchorNode
    ? (anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement)
    : null;
  const anchorItem = anchorElement ? anchorElement.closest('li[data-checked]') : null;
  const allItems = [...surface.querySelectorAll('ul[data-type="taskList"] li')];
  const lists = [...surface.querySelectorAll('ul[data-type="taskList"]')];
  return {
    focused: view.hasFocus(),
    rangeCount: dom.rangeCount,
    anchor: view.state.selection.anchor,
    head: view.state.selection.head,
    domAnchor: range ? posOf(range.startContainer, range.startOffset) : null,
    domHead: range ? posOf(range.endContainer, range.endOffset) : null,
    collapsed: range ? range.collapsed : null,
    // Box of the element the DOM selection is anchored in. An empty block has no
    // line box, so only its horizontal extent is meaningful — which is exactly
    // what proves the content area is not collapsed to zero width.
    anchorBox: anchorElement
      ? (() => {
        const box = anchorElement.getBoundingClientRect();
        return { top: box.top, left: box.left, right: box.right, bottom: box.bottom };
      })()
      : null,
    caretInsideTaskItem: Boolean(anchorItem),
    caretIndex: anchorItem ? allItems.indexOf(anchorItem) : null,
    caretListIndex: anchorItem ? lists.indexOf(anchorItem.closest('ul[data-type="taskList"]')) : null,
    activeIsCheckbox: document.activeElement?.tagName === 'INPUT',
  };
});

/**
 * Pointer path: dispatch a real mousedown/mouseup pair at the centre of the
 * targeted content box. ProseMirror maps the coordinates itself, exactly as it
 * does for an OS mouse click.
 */
const pointerIntoContent = (contentIndex, horizontalFraction = 0.5) => browser.execute(
  (index, fraction) => {
    const surface = document.querySelector('#wysiwyg-editor .tiptap');
    const content = [...surface.querySelectorAll('ul[data-type="taskList"] li > div')][index];
    if (!content) return { dispatched: false, reason: 'missing content element' };
    surface.editor.view.focus();
    const box = content.getBoundingClientRect();
    const x = box.left + Math.max(1, box.width * fraction);
    const y = box.top + box.height / 2;
    const target = document.elementFromPoint(x, y) ?? content;
    for (const type of ['mousedown', 'mouseup']) {
      target.dispatchEvent(new MouseEvent(type, {
        clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true, view: window,
      }));
    }
    return { dispatched: true, contentWidth: box.width };
  },
  contentIndex,
  horizontalFraction,
);

/**
 * Fallback used when the embedded WebDriver's synthetic events do not relocate
 * a WebKit caret: apply the same coordinates through ProseMirror's own mapping.
 */
const mapCoordsToSelection = (contentIndex, horizontalFraction = 0.5) => browser.execute(
  (index, fraction) => {
    const surface = document.querySelector('#wysiwyg-editor .tiptap');
    const editor = surface.editor;
    const content = [...surface.querySelectorAll('ul[data-type="taskList"] li > div')][index];
    if (!content) return { applied: false, reason: 'missing content element' };
    const box = content.getBoundingClientRect();
    const position = editor.view.posAtCoords({
      left: box.left + Math.max(1, box.width * fraction),
      top: box.top + box.height / 2,
    });
    if (!position) return { applied: false, reason: 'posAtCoords outside document' };
    editor.commands.setTextSelection(position.pos);
    editor.view.focus();
    return { applied: true };
  },
  contentIndex,
  horizontalFraction,
);

/**
 * Keyboard-equivalent path: move the model selection onto an item's own first
 * paragraph via `posAtDOM` (what an arrow-key step produces). Used when a
 * coordinate-mapped click would land in a nested list inside the same item.
 */
const caretIntoItemParagraph = (itemIndex) => browser.execute((index) => {
  const surface = document.querySelector('#wysiwyg-editor .tiptap');
  const editor = surface.editor;
  const view = editor.view;
  view.focus();
  const item = [...surface.querySelectorAll('ul[data-type="taskList"] li')][index];
  const paragraph = item?.querySelector(':scope > div > p');
  if (!paragraph) return { applied: false, reason: 'item has no own paragraph' };
  try {
    editor.commands.setTextSelection(view.posAtDOM(paragraph, 0));
    return { applied: true };
  } catch (error) {
    return { applied: false, reason: String(error) };
  }
}, itemIndex);

/** Click a task item's checkbox the way the NodeView expects (mousedown + change). */
const toggleCheckbox = (itemIndex) => browser.execute((index) => {
  const surface = document.querySelector('#wysiwyg-editor .tiptap');
  const box = [...surface.querySelectorAll('ul[data-type="taskList"] li input[type="checkbox"]')][index];
  if (!box) return false;
  const down = new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true });
  if (box.dispatchEvent(down)) box.focus();
  box.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
  box.click();
  return true;
}, itemIndex);

async function openFixture(fixture = FIXTURE, expectedText = 'completed item') {
  await waitForAppReady();
  await openFileInTree(fixture);
  await (await app.wysiwyg()).waitForDisplayed({ timeout: 10_000 });
  await expect(root()).toHaveText(expect.stringContaining(expectedText));
}

export function registerTaskListTests() {
  describe('MarkFlow smoke: task list layout', () => {
    it('renders empty task items with a measurable content area and a 1em checkbox', async () => {
      await openFixture();
      const geometry = await taskListGeometry();

      // Fixture shape: 3 top-level items (empty / checked / parent) + a nested list of 2.
      expect(geometry.itemCount).toBe(3);
      expect(geometry.nested?.items).toHaveLength(2);
      const [empty, checked, parent] = geometry.items;
      expect(empty.text).toBe('');
      expect(checked.checked).toBe(true);
      expect(parent.text).toContain('parent item');

      // Empty item: content area is wide (flex: 1 1 0) and the checkbox is unsquashed.
      expect(empty.content.width).toBeGreaterThan(100);
      expect(empty.content.height).toBeGreaterThan(0);
      expect(empty.content.width).toBeLessThan(geometry.taskList.width);
      expect(empty.checkbox.width).toBeGreaterThan(0);
      // It fills the row minus the checkbox and the gap instead of collapsing.
      const gap = empty.content.left - empty.checkbox.right;
      expect(gap).toBeGreaterThan(0);
      expect(Math.abs(empty.content.width - (empty.item.width - empty.checkbox.width - gap))).toBeLessThan(2);

      // Checkbox size tracks the inline body font-size (18px default) within ±2px.
      for (const item of [...geometry.items, ...geometry.nested.items]) {
        expect(Math.abs(item.checkbox.width - geometry.fontSize)).toBeLessThanOrEqual(2);
        expect(Math.abs(item.checkbox.height - geometry.fontSize)).toBeLessThanOrEqual(2);
        // Checked and unchecked render at the same size.
        expect(Math.abs(item.checkbox.width - checked.checkbox.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(item.checkbox.height - checked.checkbox.height)).toBeLessThanOrEqual(1);
      }

      // Alignment: one checkbox left edge per level, one content left edge at the
      // top level, and nesting only shifts the nested items right.
      expect(new Set(geometry.items.map((item) => Math.round(item.checkbox.left))).size).toBe(1);
      expect(new Set(geometry.nested.items.map((item) => Math.round(item.checkbox.left))).size).toBe(1);
      expect(new Set(geometry.items.map((item) => Math.round(item.content.left))).size).toBe(1);
      expect(geometry.nested.items[0].checkbox.left).toBeGreaterThan(geometry.items[0].checkbox.left);

      // No horizontal overflow from flex: 1 1 0.
      for (const item of [...geometry.items, ...geometry.nested.items]) {
        expect(item.content.right).toBeLessThanOrEqual(geometry.surface.right + 0.5);
        expect(item.item.right).toBeLessThanOrEqual(geometry.surface.right + 0.5);
      }

      // Task items are spaced tighter than paragraphs. Two independent checks:
      // (1) computed styles encode the contract directly (no margin collapsing
      //     can hide a regression),
      // (2) rendered whitespace between adjacent paragraph boxes confirms it.
      expect(geometry.paragraphCount).toBeGreaterThanOrEqual(3);
      // Fixture shape: heading, paragraph, list, paragraph, paragraph → exactly
      // one DOM-adjacent paragraph pair. The gap that spans the list is excluded.
      expect(geometry.adjacentParagraphGaps).toHaveLength(1);
      expect(geometry.itemTextGaps.length).toBeGreaterThanOrEqual(1);

      const { item, itemParagraph, paragraph } = geometry.computedStyles;
      // Baseline: `.ProseMirror p { margin-bottom: 0.75em }` — the paragraph gap
      // every other block is compared against.
      expect(paragraph.marginBottom).toBe(`${geometry.fontSize * 0.75}px`);
      // Task item keeps the tighter 0.25em item gap…
      expect(item.marginBottom).toBe(`${geometry.fontSize * 0.25}px`);
      // …and its inner paragraph must NOT stack another 0.75em on top.
      expect(itemParagraph.marginBottom).toBe('0px');
      const itemMargin = parseFloat(item.marginBottom);
      const paragraphMargin = parseFloat(paragraph.marginBottom);
      expect(itemMargin).toBeGreaterThan(0);
      expect(itemMargin).toBeLessThan(paragraphMargin);

      // Rendered proof: whitespace between two task items' paragraph boxes stays
      // below the whitespace between two DOM-adjacent paragraphs.
      expect(Math.max(...geometry.itemTextGaps)).toBeLessThan(
        Math.min(...geometry.adjacentParagraphGaps),
      );

      await browser.saveScreenshot(ARTIFACT('task-list-layout.png'));
    });

    // NOTE: the pointer path below is a synthetic mousedown/mouseup pair, which
    // does not relocate a WebKit caret; the test therefore falls back to
    // `posAtCoords` + `setTextSelection` (a programmatic selection). OS-mouse
    // caret paint is covered by the native window screenshots in
    // `e2e/artifacts/` plus manual review — not by this synthetic path.
    it('places a caret inside an empty task item via coordinate mapping and keyboard movement', async () => {
      await openFixture();
      const before = await taskListGeometry();
      expect(before.items[0].text).toBe('');
      expect(before.items[0].content.width).toBeGreaterThan(0);

      // ── Path 1: pointer into the empty item's content area ──
      const pointer = await pointerIntoContent(0);
      // `reason` is only populated on failure, so throw it rather than letting
      // a bare false hide why the dispatch failed. (WDIO's jest-style `expect`
      // takes a single argument, so a custom message must be a real throw.)
      if (!pointer.dispatched) throw new Error(`pointer dispatch failed: ${pointer.reason}`);
      // The dispatch must have aimed at a content box with real width — a
      // collapsed box would make the whole pointer path meaningless.
      expect(pointer.contentWidth).toBeGreaterThan(100);
      let afterClick = await selectionState();
      // Record which path actually moved the caret: WebDriver's synthetic events
      // do not always relocate a WebKit caret, in which case the same
      // coordinates are applied through ProseMirror's own mapping.
      let pointerMode = 'native-events';
      if (!afterClick.caretInsideTaskItem || afterClick.caretIndex !== 0) {
        pointerMode = 'posAtCoords';
        const mapped = await mapCoordsToSelection(0);
        // The fallback is the path that really runs under the embedded
        // WebDriver; a silent no-op must fail here rather than pass vacuously.
        if (!mapped.applied) throw new Error(`coordinate mapping failed: ${mapped.reason}`);
        afterClick = await selectionState();
      }
      expect(afterClick.focused).toBe(true);
      expect(afterClick.rangeCount).toBe(1);
      // A caret, not a text range: WebKit needs a collapsed selection to paint one.
      expect(afterClick.collapsed).toBe(true);
      expect(afterClick.caretInsideTaskItem).toBe(true);
      // Whichever path ran (`pointerMode` is carried into the matcher object for
      // diagnostics), the resulting selection must be identical.
      expect({ pointerMode, caretIndex: afterClick.caretIndex }).toEqual({ pointerMode, caretIndex: 0 });
      expect(afterClick.caretListIndex).toBe(0);
      // The DOM selection is anchored in an element that spans the empty item's
      // content box. That is the precondition WebKit needs in order to paint a
      // caret: a content area with zero width cannot show one. `Range` itself
      // reports a zero rect for an empty block under the embedded WebDriver, so
      // measure the anchor element instead of the range.
      expect(afterClick.anchorBox).not.toBeNull();
      expect(afterClick.anchorBox.left).toBeGreaterThanOrEqual(before.items[0].content.left - 2);
      expect(afterClick.anchorBox.right).toBeLessThanOrEqual(before.items[0].content.right + 2);
      expect(afterClick.anchorBox.right - afterClick.anchorBox.left).toBeGreaterThan(100);
      // `posAtDOM` cannot always resolve an empty paragraph, so compare when it can.
      if (afterClick.domAnchor !== null) expect(afterClick.domAnchor).toBe(afterClick.anchor);

      // Typing lands in that empty item, not in a neighbouring block.
      await root().addValue('click');
      await browser.waitUntil(async () => (await taskListGeometry()).items[0].text.includes('click'), {
        timeout: 5_000,
        timeoutMsg: 'Expected the typed text to land in the clicked empty task item',
      });
      await browser.execute(() => document.querySelector('#wysiwyg-editor .tiptap').editor.commands.undo());
      await browser.waitUntil(async () => (await taskListGeometry()).items[0].text === '', {
        timeout: 5_000,
        timeoutMsg: 'Expected undo to clear the empty task item again',
      });

      // ── Path 2: keyboard movement into the empty item ──
      const keyboardPos = await browser.execute(() => {
        const surface = document.querySelector('#wysiwyg-editor .tiptap');
        const editor = surface.editor;
        const view = editor.view;
        const empty = [...surface.querySelectorAll('ul[data-type="taskList"] li')][0];
        const paragraph = empty.querySelector(':scope > div > p');
        if (!paragraph) return { ok: false, reason: 'empty item has no paragraph' };
        // The same edit an arrow-key step produces, with no pointer coordinate.
        view.focus();
        try {
          const pos = view.posAtDOM(paragraph, 0);
          editor.commands.setTextSelection(pos);
          return { ok: true };
        } catch (error) {
          return { ok: false, reason: String(error) };
        }
      });
      if (!keyboardPos.ok) throw new Error(`keyboard path failed: ${keyboardPos.reason}`);
      const afterKeyboard = await selectionState();
      expect(afterKeyboard.focused).toBe(true);
      expect(afterKeyboard.caretInsideTaskItem).toBe(true);
      expect(afterKeyboard.caretIndex).toBe(0);
      if (afterKeyboard.domHead !== null) expect(afterKeyboard.domHead).toBe(afterKeyboard.head);

      await browser.saveScreenshot(ARTIFACT('task-list-empty-caret.png'));

      // The caret really is in the empty item: typing and undo act there.
      await root().addValue('k');
      await browser.waitUntil(async () => (await taskListGeometry()).items[0].text === 'k', {
        timeout: 5_000,
        timeoutMsg: 'Expected the keyboard-placed caret to receive the typed character',
      });
      await browser.saveScreenshot(ARTIFACT('task-list-typed-caret.png'));
      await browser.execute(() => document.querySelector('#wysiwyg-editor .tiptap').editor.commands.undo());
      await browser.waitUntil(async () => (await taskListGeometry()).items[0].text === '', { timeout: 5_000 });
    });

    it('toggles the checkbox without moving the caret and keeps nested items consistent', async () => {
      await openFixture();
      const before = await taskListGeometry();
      expect(before.items[0].checked).toBe(false);

      // Put the caret in the third item so the checkbox click can be shown not to
      // steal or move it. That item contains a nested list, so aim at its own
      // paragraph rather than at the vertical centre of the whole item.
      const caretSetup = await caretIntoItemParagraph(2);
      if (!caretSetup.applied) throw new Error(`caret setup failed: ${caretSetup.reason}`);
      const beforeToggle = await selectionState();
      expect(beforeToggle.caretIndex).toBe(2);

      expect(await toggleCheckbox(0)).toBe(true);
      await browser.waitUntil(async () => (await taskListGeometry()).items[0].checked === true, {
        timeout: 5_000,
        timeoutMsg: 'Expected the first task item to become checked',
      });

      const afterToggle = await taskListGeometry();
      expect(afterToggle.items[0].checked).toBe(true);
      // Checked and unchecked boxes keep identical dimensions.
      expect(Math.abs(afterToggle.items[0].checkbox.width - afterToggle.items[1].checkbox.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(afterToggle.items[0].checkbox.height - afterToggle.items[1].checkbox.height)).toBeLessThanOrEqual(1);
      // Layout does not reflow: same edges and same content width.
      expect(Math.abs(afterToggle.items[0].content.left - before.items[0].content.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(afterToggle.items[0].content.width - before.items[0].content.width)).toBeLessThanOrEqual(1);
      // The caret stays where the user put it.
      const afterToggleSelection = await selectionState();
      expect(afterToggleSelection.head).toBe(beforeToggle.head);
      expect(afterToggleSelection.caretIndex).toBe(2);
      // …and clicking the checkbox did not hand focus to the input element
      // (that is what would steal the caret in a real mouse click).
      expect(afterToggleSelection.focused).toBe(true);
      expect(afterToggleSelection.activeIsCheckbox).toBe(false);

      // Toggling back restores the unchecked state through the model.
      expect(await toggleCheckbox(0)).toBe(true);
      await browser.waitUntil(async () => (await taskListGeometry()).items[0].checked === false, {
        timeout: 5_000,
        timeoutMsg: 'Expected the first task item to become unchecked again',
      });

      // Nested items keep the same checkbox size and a usable content width.
      const geometry = await taskListGeometry();
      const nested = geometry.nested.items;
      expect(nested).toHaveLength(2);
      expect(nested[0].text).toBe('');
      for (const item of nested) {
        expect(Math.abs(item.checkbox.width - geometry.fontSize)).toBeLessThanOrEqual(2);
        expect(Math.abs(item.checkbox.height - geometry.fontSize)).toBeLessThanOrEqual(2);
        expect(item.content.width).toBeGreaterThan(0);
        expect(item.content.left).toBeGreaterThan(geometry.items[2].content.left);
      }
      expect(Math.abs(nested[0].checkbox.width - nested[1].checkbox.width)).toBeLessThanOrEqual(1);
      // Nested items keep the tight item spacing, well below paragraph spacing.
      const nestedGap = nested[1].item.top - nested[0].item.bottom;
      expect(nestedGap).toBeLessThan(Math.min(...geometry.adjacentParagraphGaps));

      await browser.saveScreenshot(ARTIFACT('task-list-checkbox-toggle.png'));
    });

    it('keeps an ordinary list nested in a task item at the generic list margin', async () => {
      await openFixture(NESTED_FIXTURE, 'nested task done');
      const snapshot = await nestedListMargins();
      const { plain, task } = snapshot;

      // Fixture shape: item 0 holds a nested PLAIN bullet list, item 1 a nested TASK list.
      expect(snapshot.fontSize).toBe(18);
      expect(plain).not.toBeNull();
      expect(task).not.toBeNull();
      expect(plain.parentItemIndex).toBe(0);
      expect(task.parentItemIndex).toBe(1);
      expect(plain.itemCount).toBe(2);
      expect(task.itemCount).toBe(2);

      // The plain nested list really is plain (rendered by WebKit, not by the
      // fixture text): no taskList marker, ordinary bullet marker and indent.
      expect(plain.dataType).toBeNull();
      expect(plain.listStyleType).not.toBe('none');
      expect(plain.paddingLeft).toBe('24px');
      // …and it keeps the generic `.ProseMirror ul { margin-bottom: 1em }` gap.
      // The leaking rule (`… li > div > ul`) made this 0.25em = 4.5px.
      expect(plain.marginBottom).toBe(`${snapshot.fontSize * 1}px`);

      // The nested task list keeps the tightened 0.25em tail margin.
      expect(task.dataType).toBe('taskList');
      expect(task.listStyleType).toBe('none');
      expect(task.marginBottom).toBe(`${snapshot.fontSize * 0.25}px`);

      // Leak signature: the plain list must be spaced like ordinary lists, i.e.
      // strictly wider than the nested task list, never equal to it.
      expect(parseFloat(plain.marginBottom)).toBeGreaterThan(parseFloat(task.marginBottom));

      await browser.saveScreenshot(ARTIFACT('task-list-nested-lists.png'));
    });

    it('scales the checkbox with the body font-size setting', async () => {
      await openFixture();
      const before = await taskListGeometry();
      expect(Math.abs(before.items[0].checkbox.width - before.fontSize)).toBeLessThanOrEqual(2);

      await openSettings();
      await (await app.settingsTab('appearance')).click();

      /** Drive the real settings select; when the embedded WebDriver cannot
       * activate a native `<option>`, fall back to the same `change` event the
       * select fires itself. The fallback only chooses HOW the setting is
       * applied — every assertion below still reads the rendered end state, so a
       * silent no-op fails instead of passing. */
      const applyFontSize = async (value) => {
        await $('#setting-fontsize').selectByAttribute('value', String(value));
        const nativeApplied = await browser
          .waitUntil(async () => (await taskListGeometry()).fontSize === Number(value), { timeout: 3_000 })
          .then(() => true)
          .catch(() => false);
        if (!nativeApplied) {
          await browser.execute((next) => {
            const select = document.getElementById('setting-fontsize');
            select.value = next;
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }, String(value));
        }
        // Unconditional: either path must leave the rendered font-size applied.
        await browser.waitUntil(async () => (await taskListGeometry()).fontSize === Number(value), {
          timeout: 5_000,
          timeoutMsg: `Expected the body font-size to become ${value}px`,
        });
        return nativeApplied ? 'native-select' : 'change-event';
      };

      const enlargedMode = await applyFontSize(22);
      const enlarged = await taskListGeometry();
      // The observable end state is asserted unconditionally, so the choice of
      // path (`enlargedMode`, carried into the matcher object for diagnostics)
      // can never turn a no-op into a pass.
      expect({ path: enlargedMode, fontSize: enlarged.fontSize }).toEqual({ path: enlargedMode, fontSize: 22 });
      expect(Math.abs(enlarged.items[0].checkbox.width - enlarged.fontSize)).toBeLessThanOrEqual(2);
      expect(enlarged.items[0].checkbox.width).toBeGreaterThan(before.items[0].checkbox.width);

      // Restore 18px so the later smoke steps keep the default typography.
      await applyFontSize(18);
      await closeSettings();
      const restored = await taskListGeometry();
      expect(restored.fontSize).toBe(18);
      expect(Math.abs(restored.items[0].checkbox.width - before.items[0].checkbox.width)).toBeLessThanOrEqual(1);

      await browser.saveScreenshot(ARTIFACT('task-list-font-scale.png'));
    });
  });
}
