import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Editor } from '@tiptap/core';

// We only test the pure logic: given a ProseMirror doc with known lastChild,
// does ensureContinuationParagraph detect the right conditions? Actual ProseMirror
// dispatching requires a full Editor instance, so we mock the editor interface.

import * as editorState from './editor.state';

describe('ensureContinuationParagraph', () => {
  let ensureContinuationParagraph: typeof import('./editor.continuation').ensureContinuationParagraph;

  beforeEach(async () => {
    // Dynamic import to get fresh module state
    ensureContinuationParagraph = (await import('./editor.continuation')).ensureContinuationParagraph;
  });

  it('returns false when there is no editor', () => {
    vi.spyOn(editorState, 'getEditor').mockReturnValue(null);
    expect(ensureContinuationParagraph()).toBe(false);
  });

  it('returns false when mode is not wysiwyg', () => {
    vi.spyOn(editorState, 'getMode').mockReturnValue('source');
    const mockEditor = { state: {} } as unknown as Editor;
    vi.spyOn(editorState, 'getEditor').mockReturnValue(mockEditor);
    expect(ensureContinuationParagraph()).toBe(false);
  });

  it('returns false when document has no children', () => {
    vi.spyOn(editorState, 'getMode').mockReturnValue('wysiwyg');
    const mockEditor = {
      state: {
        doc: { childCount: 0 },
        schema: {},
      },
    } as unknown as Editor;
    vi.spyOn(editorState, 'getEditor').mockReturnValue(mockEditor);
    expect(ensureContinuationParagraph()).toBe(false);
  });

  it('returns false when last child is a paragraph (not a target block)', () => {
    vi.spyOn(editorState, 'getMode').mockReturnValue('wysiwyg');
    const mockEditor = {
      state: {
        doc: {
          childCount: 1,
          child: () => ({ type: { name: 'paragraph' } }),
        },
        schema: {},
      },
    } as unknown as Editor;
    vi.spyOn(editorState, 'getEditor').mockReturnValue(mockEditor);
    expect(ensureContinuationParagraph()).toBe(false);
  });

  it('returns true when last child is an image block', () => {
    vi.spyOn(editorState, 'getMode').mockReturnValue('wysiwyg');
    const mockEditor = {
      state: {
        doc: {
          childCount: 1,
          content: { size: 10 },
        },
        schema: {
          nodes: {
            paragraph: {
              create: () => ({ type: 'paragraph' }),
            },
          },
        },
        tr: {
          insert: () => ({ /* mock transaction */ }),
        },
      },
      view: {
        dispatch: vi.fn(),
      },
    } as unknown as Editor;
    // We need the child() function to return image type
    Object.defineProperty(mockEditor.state.doc, 'child', {
      value: () => ({ type: { name: 'image' } }),
    });
    vi.spyOn(editorState, 'getEditor').mockReturnValue(mockEditor);
    expect(ensureContinuationParagraph()).toBe(true);
  });

  it('returns true when last child is a blockquote', () => {
    vi.spyOn(editorState, 'getMode').mockReturnValue('wysiwyg');
    const mockEditor = {
      state: {
        doc: {
          childCount: 1,
          content: { size: 10 },
        },
        schema: {
          nodes: {
            paragraph: {
              create: () => ({ type: 'paragraph' }),
            },
          },
        },
        tr: {
          insert: () => ({ /* mock transaction */ }),
        },
      },
      view: {
        dispatch: vi.fn(),
      },
    } as unknown as Editor;
    Object.defineProperty(mockEditor.state.doc, 'child', {
      value: () => ({ type: { name: 'blockquote' } }),
    });
    vi.spyOn(editorState, 'getEditor').mockReturnValue(mockEditor);
    expect(ensureContinuationParagraph()).toBe(true);
  });

  it('returns true when last child is a codeBlock', () => {
    vi.spyOn(editorState, 'getMode').mockReturnValue('wysiwyg');
    const mockEditor = {
      state: {
        doc: {
          childCount: 1,
          content: { size: 10 },
        },
        schema: {
          nodes: {
            paragraph: {
              create: () => ({ type: 'paragraph' }),
            },
          },
        },
        tr: {
          insert: () => ({ /* mock transaction */ }),
        },
      },
      view: {
        dispatch: vi.fn(),
      },
    } as unknown as Editor;
    Object.defineProperty(mockEditor.state.doc, 'child', {
      value: () => ({ type: { name: 'codeBlock' } }),
    });
    vi.spyOn(editorState, 'getEditor').mockReturnValue(mockEditor);
    expect(ensureContinuationParagraph()).toBe(true);
  });
});
