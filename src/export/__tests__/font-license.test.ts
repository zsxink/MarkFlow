import { describe, it, expect } from 'vitest';

import { buildExportTheme } from '../theme/base';
import { generateInlineFontCss } from '../theme/fonts';

/**
 * Guards the OFL reserved-font-name decision recorded in
 * `third-party/fonts/PROVENANCE.md`: the bundled CJK font is a subset, which
 * makes it a Modified Version, so it must not be presented to users under the
 * upstream name "Source Han Serif SC". Source Serif 4 is an unchanged WOFF2
 * repackaging and therefore keeps its upstream name.
 */

/** Minimal fetch stand-in so `generateInlineFontCss` does not hit happy-dom. */
function stubFontFetch() {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return {
      ok: true,
      blob: async () => new Blob([new Uint8Array([0, 1, 2, 3])]),
    } as unknown as Response;
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

describe('bundled font family names', () => {
  it('export theme body font uses MarkFlow Serif SC, not the upstream CJK name', () => {
    const theme = buildExportTheme('light');
    expect(theme.body.fontFamily).toContain("'MarkFlow Serif SC'");
    expect(theme.fonts.eastAsia).toContain("'MarkFlow Serif SC'");
    // The upstream name may only survive as a *system* fallback.
    expect(theme.fonts.eastAsia.indexOf("'MarkFlow Serif SC'")).toBeLessThan(
      theme.fonts.eastAsia.indexOf("'Source Han Serif SC'") === -1
        ? Number.POSITIVE_INFINITY
        : theme.fonts.eastAsia.indexOf("'Source Han Serif SC'"),
    );
  });

  it('export theme keeps Source Serif 4 for Latin text', () => {
    const theme = buildExportTheme('light');
    expect(theme.body.fontFamily).toContain('Source Serif 4');
  });

  it('inlines the CJK subset under the renamed family', async () => {
    const stub = stubFontFetch();
    try {
      const css = await generateInlineFontCss();
      expect(css).toContain("font-family: 'MarkFlow Serif SC'");
      expect(css).toContain("font-family: 'Source Serif 4'");
      // No @font-face rule may declare the upstream CJK family.
      expect(css).not.toContain("font-family: 'Source Han Serif SC'");
      // Both CJK weights must be covered.
      const cjkRules = css
        .split('@font-face')
        .filter((rule) => rule.includes("'MarkFlow Serif SC'"));
      expect(cjkRules).toHaveLength(2);
      expect(cjkRules.filter((rule) => rule.includes('font-weight: 400'))).toHaveLength(1);
      expect(cjkRules.filter((rule) => rule.includes('font-weight: 700'))).toHaveLength(1);
    } finally {
      stub.restore();
    }
  });

  it('falls back to the bundled file paths when inlining fails', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    try {
      const css = await generateInlineFontCss();
      // The fallback path is what actually ships in the installer, so assert the
      // subset filenames are the ones referenced, under the renamed family.
      expect(css).toContain("font-family: 'MarkFlow Serif SC'");
      expect(css).toContain('/assets/fonts/SourceHanSerifSC-Regular-common.woff2');
      expect(css).toContain('/assets/fonts/SourceHanSerifSC-Bold-common.woff2');
    } finally {
      globalThis.fetch = original;
    }
  });
});
