import type { ShortcutPlatform } from '../utils/shortcut';

/**
 * Platform family used to pick shortcut notation.
 *
 * `navigator.platform` is the primary signal (it is what the context menu used
 * before this was shared); the UA string is the fallback for webviews that
 * report an empty platform. Read on every call rather than cached in a module
 * constant, so tests can drive it by stubbing `navigator`.
 */
export function shortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const platform = navigator.platform ?? '';
  const userAgent = navigator.userAgent ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform) || /macintosh/i.test(userAgent)
    ? 'macos'
    : 'other';
}
