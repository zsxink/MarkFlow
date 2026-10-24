/**
 * Platform-correct shortcut hints for static markup.
 *
 * Static HTML cannot know whether the user is on macOS, so tooltips would
 * either show the wrong chord or need per-platform copies. Instead an element
 * declares the accelerator once (`data-shortcut="Mod+S"`), keeps its plain
 * label in `data-tooltip` / `title`, and the chord is appended here at boot
 * (issue #406: macOS users were told to press Ctrl+S, which does nothing).
 */
import { shortcutPlatform } from '../infra/platform';
import { formatShortcut } from '../utils/shortcut';

/** Rendered chord for `accelerator` on the current platform. */
export function shortcutLabel(accelerator: string): string {
  return formatShortcut(accelerator, shortcutPlatform());
}

/**
 * Append the chord to every `[data-shortcut]` element under `root`.
 *
 * Idempotent: the applied flag stops a second pass from doubling the suffix
 * when the panel is re-rendered in place.
 */
export function applyShortcutHints(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-shortcut]')) {
    if (element.dataset.shortcutApplied === 'true') continue;
    const accelerator = element.dataset.shortcut;
    if (!accelerator) continue;

    const chord = shortcutLabel(accelerator);
    const tooltip = element.dataset.tooltip;
    if (tooltip) element.dataset.tooltip = `${tooltip} (${chord})`;
    else if (element.title) element.title = `${element.title} (${chord})`;

    element.dataset.shortcutApplied = 'true';
  }
}
