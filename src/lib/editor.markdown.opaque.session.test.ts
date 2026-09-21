import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SafeParagraph } from './editor.extensions';
import {
  OpaqueNode,
  OPAQUE_NODE_NAME,
  setActiveOpaqueRegistry,
} from './editor.markdown.opaque.extension';
import {
  beginOpaqueSession,
  endOpaqueSession,
  getOpaqueRegistry,
  onPipelineModeChanged,
} from './editor.markdown.opaque.session';
import { restoreOpaque } from './editor.markdown.opaque.bridge';
import { createMarkdownExtension } from './editor.init';

/**
 * Task 7.6 — opaque registry lifecycle cleanup.
 *
 * On document switch, reload, pipeline degrade and editor destroy the opaque
 * registry (and its active parser handle) must be cleared. After teardown an
 * old sentinel can never be resolved: for a fresh session it is plain user
 * text, never an internal node; restore reports it as a conflict.
 */
describe('opaque registry lifecycle (7.6)', () => {
  afterEach(() => {
    endOpaqueSession();
    setActiveOpaqueRegistry(null);
  });

  function makeEditor() {
    return new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
        SafeParagraph,
        OpaqueNode,
        createMarkdownExtension(),
      ],
      onDestroy: () => endOpaqueSession(),
    });
  }

  it('begins a session: the registry is active and sentinels parse to nodes', () => {
    const result = beginOpaqueSession('<!-- a -->\n\n# Hi\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getOpaqueRegistry()).toBe(result.registry); // active handle installed
    expect(result.markdown).toContain('⟦MF-OPAQUE:');

    // Parsing the sentinel source creates opaque nodes in a fresh editor.
    const editor = makeEditor();
    editor.commands.setContent(result.markdown, { contentType: 'markdown' } as never);
    const ops = (editor.getJSON().content ?? []).filter((n) => n.type === OPAQUE_NODE_NAME);
    expect(ops).toHaveLength(1);
    editor.destroy();
  });

  it('after endOpaqueSession an old sentinel is unusable in a NEW session', () => {
    const first = beginOpaqueSession('<!-- first doc -->\n');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const oldSentinel = first.markdown;
    const oldRegistry = first.registry;

    // Document switch teardown.
    endOpaqueSession();
    expect(getOpaqueRegistry()).toBeNull();
    expect(oldRegistry.size).toBe(0); // cleared + nonce rolled

    // A brand-new document starts a fresh session that does not know old slots.
    const second = beginOpaqueSession('# fresh doc\n');
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    // Restore the OLD sentinel against the NEW registry → unknown-slot conflict.
    const restore = restoreOpaque(oldSentinel, second.registry);
    expect(restore.ok).toBe(false);
    if (!restore.ok) expect(restore.code).toBe('unknown-slot');

    // Parsing the old sentinel in the new session yields user text, NOT a node.
    const editor = makeEditor();
    editor.commands.setContent(oldSentinel, { contentType: 'markdown' } as never);
    const ops = (editor.getJSON().content ?? []).filter((n) => n.type === OPAQUE_NODE_NAME);
    expect(ops).toHaveLength(0);
    // The sentinel is preserved as literal text (no internal node, no silent drop).
    expect(JSON.stringify(editor.getJSON())).toContain('⟦MF-OPAQUE:');
    editor.destroy();
  });

  it('pipeline degrade below opaque ends the session', () => {
    const result = beginOpaqueSession('<!-- x -->\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const registry = getOpaqueRegistry();
    expect(registry).not.toBeNull();

    // Killing the switch back to `source-only` (or `gated`, `v3-compatible`)
    // must drop the session.
    onPipelineModeChanged('source-only');
    expect(getOpaqueRegistry()).toBeNull();
    expect(registry?.size).toBe(0);

    // Staying at/above `opaque` keeps it.
    onPipelineModeChanged('opaque');
    beginOpaqueSession('<!-- y -->\n');
    expect(getOpaqueRegistry()).not.toBeNull();
  });

  it('beginOpaqueSession replaces any previous session atomically', () => {
    beginOpaqueSession('<!-- a -->\n');
    const a = getOpaqueRegistry();
    const b = beginOpaqueSession('<!-- b -->\n');
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(getOpaqueRegistry()).toBe(b.registry); // now the new one
    expect(a?.size).toBe(0); // old cleared
    expect(a?.nonce).not.toBe(b.registry.nonce); // nonce rolled
  });

  it('a stale editor session never leaks into the next editor', () => {
    const editor1 = makeEditor();
    const s1 = beginOpaqueSession('<!-- old -->\n');
    expect(s1.ok).toBe(true);
    if (!s1.ok) return;
    editor1.commands.setContent(s1.markdown, { contentType: 'markdown' } as never);
    const nodeInFirst = (editor1.getJSON().content ?? []).some((n) => n.type === OPAQUE_NODE_NAME);
    expect(nodeInFirst).toBe(true);

    // Editor destroy tears the session down.
    editor1.destroy();
    expect(getOpaqueRegistry()).toBeNull();

    // A subsequent editor must treat the old sentinel as text, not resolve it.
    const editor2 = makeEditor();
    editor2.commands.setContent(s1.markdown, { contentType: 'markdown' } as never);
    const ops2 = (editor2.getJSON().content ?? []).filter((n) => n.type === OPAQUE_NODE_NAME);
    expect(ops2).toHaveLength(0);
    editor2.destroy();
  });

  it('8.7: an external reload (changed source) forces full re-admission with fresh slots', () => {
    // Old session.
    const old = beginOpaqueSession('# v1\n\n<!-- note v1 -->\n');
    expect(old.ok).toBe(true);
    if (!old.ok) return;
    const oldSentinel = old.markdown;
    const oldSlot = old.registry.all()[0].slot;

    // External modification detected → reload ends the session.
    endOpaqueSession();
    expect(getOpaqueRegistry()).toBeNull();

    // Re-admission with a CHANGED source: the new baseline reflects the new
    // bytes and the old slot/registry is never reused.
    const reloaded = beginOpaqueSession('# v2\n\n<!-- note v2 -->\n');
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    const newSlots = reloaded.registry.all().map((e) => e.slot);
    expect(newSlots.includes(oldSlot)).toBe(false); // old slot never reused
    expect(reloaded.registry.all()[0].raw).toBe('<!-- note v2 -->'); // new raw
    // Restoring the OLD sentinel against the NEW session is a conflict (stale):
    // the new registry does not know the old slot.
    const restore = restoreOpaque(oldSentinel, reloaded.registry);
    expect(restore.ok).toBe(false);
    if (!restore.ok) expect(restore.code).toBe('unknown-slot');
  });

  it('8.8: on a reconcile conflict, only the original source is the safe recovery text', () => {
    // The original source (never internal tokens) is what Source/Save uses.
    const source = '# hi\n\n<!-- x -->\n';
    const s = beginOpaqueSession(source);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    // The registry holds the EXACT original bytes for restore; no sentinel.
    const registry = getOpaqueRegistry()!;
    expect(registry.all()[0].raw).toBe('<!-- x -->');
    // beginOpaqueSession's rendered markdown is sentinel-bearing (for the
    // editor), but the registry raw + the caller's source baseline are the
    // only things that may reach disk — both are sentinel-free.
    expect(source).not.toContain('⟦MF-OPAQUE:');
    expect(registry.all()[0].raw).not.toContain('⟦MF-OPAQUE:');
  });
});
