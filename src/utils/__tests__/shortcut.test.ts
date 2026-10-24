import { describe, expect, it } from 'vitest';

import { formatShortcut } from '../shortcut';

describe('formatShortcut', () => {
  it('renders the primary modifier per platform', () => {
    expect(formatShortcut('Mod+S', 'macos')).toBe('⌘S');
    expect(formatShortcut('Mod+S', 'other')).toBe('Ctrl+S');
  });

  it('uses modifier symbols without separators on macOS', () => {
    expect(formatShortcut('Shift+Mod+F', 'macos')).toBe('⇧⌘F');
    expect(formatShortcut('Alt+Mod+I', 'macos')).toBe('⌥⌘I');
    // Apple's order: Control, Option, Shift, Command.
    expect(formatShortcut('Mod+Shift+Alt+Ctrl+K', 'macos')).toBe('⌃⌥⇧⌘K');
  });

  it('joins modifier names with + elsewhere', () => {
    expect(formatShortcut('Shift+Mod+F', 'other')).toBe('Ctrl+Shift+F');
    expect(formatShortcut('Alt+Mod+I', 'other')).toBe('Ctrl+Alt+I');
  });

  it('keeps Control distinct from the primary modifier on macOS', () => {
    // Ctrl+Tab must not render as ⌘Tab: the tab accelerators really are
    // Control-only, including on macOS.
    expect(formatShortcut('Ctrl+Tab', 'macos')).toBe('⌃Tab');
    expect(formatShortcut('Ctrl+Shift+Tab', 'macos')).toBe('⌃⇧Tab');
    expect(formatShortcut('Ctrl+Tab', 'other')).toBe('Ctrl+Tab');
  });

  it('renders punctuation keys as-is', () => {
    expect(formatShortcut('Mod+/', 'macos')).toBe('⌘/');
    expect(formatShortcut('Mod+\\', 'macos')).toBe('⌘\\');
    expect(formatShortcut('Mod+`', 'other')).toBe('Ctrl+`');
  });

  it('passes through keys without modifiers', () => {
    expect(formatShortcut('F5', 'macos')).toBe('F5');
    expect(formatShortcut('Tab', 'other')).toBe('Tab');
  });

  it('keeps unknown tokens visible instead of dropping them', () => {
    // A typo should look wrong in the UI rather than silently change meaning.
    expect(formatShortcut('Hyper+S', 'other')).toBe('Hyper+S');
    expect(formatShortcut('Hyper+S', 'macos')).toBe('HyperS');
  });

  it('returns an empty label for an empty accelerator', () => {
    expect(formatShortcut('', 'macos')).toBe('');
  });
});
