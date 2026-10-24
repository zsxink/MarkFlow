/**
 * Shortcut label rendering.
 *
 * Accelerators are declared once, platform-neutrally (`Mod+S`), and rendered
 * per platform afterwards: macOS uses the modifier symbols with no separators
 * (`⌘S`, `⇧⌘F`, `⌃Tab`), everything else uses names joined by `+`
 * (`Ctrl+S`, `Ctrl+Shift+F`).
 *
 * Issue #406: the UI hardcoded one platform's notation, so macOS users were
 * told to press Ctrl+S — a chord the macOS menu never listens for, which made
 * the hint itself a dead key.
 *
 * `Mod` is the platform's primary modifier (Command on macOS, Control
 * elsewhere); `Ctrl` always means Control, so `⌃` and `⌘` stay distinguishable
 * on macOS.
 */

/** Platform family, as far as shortcut notation goes. */
export type ShortcutPlatform = 'macos' | 'other';

const MAC_SYMBOLS: Record<string, string> = {
  mod: '⌘',
  shift: '⇧',
  alt: '⌥',
  ctrl: '⌃',
};

const OTHER_NAMES: Record<string, string> = {
  mod: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  ctrl: 'Ctrl',
};

/** Apple's modifier order in menus: Control, Option, Shift, Command. */
const MAC_ORDER = ['ctrl', 'alt', 'shift', 'mod'];
/** Windows/Linux order: Ctrl, Alt, Shift. */
const OTHER_ORDER = ['mod', 'ctrl', 'alt', 'shift'];

/**
 * Render one accelerator for `platform`.
 * Unknown modifier tokens are kept verbatim instead of being dropped, so a typo
 * shows up in the UI rather than silently changing the meaning.
 */
export function formatShortcut(accelerator: string, platform: ShortcutPlatform): string {
  const tokens = accelerator
    .split('+')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return '';

  const key = tokens[tokens.length - 1];
  const modifiers = tokens.slice(0, -1).map((token) => ({ raw: token, lower: token.toLowerCase() }));
  const unknown = modifiers.filter((modifier) => !MAC_ORDER.includes(modifier.lower));

  if (platform === 'other') {
    const known = OTHER_ORDER.filter((modifier) => modifiers.some((token) => token.lower === modifier))
      .map((modifier) => OTHER_NAMES[modifier]);
    return [...known, ...unknown.map((modifier) => modifier.raw), key].join('+');
  }

  const symbols = MAC_ORDER.filter((modifier) => modifiers.some((token) => token.lower === modifier))
    .map((modifier) => MAC_SYMBOLS[modifier]);
  return [...unknown.map((modifier) => modifier.raw), ...symbols].join('') + key;
}
