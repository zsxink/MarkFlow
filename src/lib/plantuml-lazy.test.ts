import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}));

import {
  buildPlantUmlSvgUrl,
  clearSvgCache,
  encodePlantUml,
  isBlankPlantUmlSource,
  renderPlantUmlSvg,
  sanitizePlantUmlSvg,
} from './plantuml-lazy';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSvgCache();
});

describe('PlantUML client', () => {
  it('encodes source and builds the official server SVG endpoint', () => {
    const url = buildPlantUmlSvgUrl('https://plantuml.com', '@startuml\nAlice -> Bob\n@enduml');
    expect(url).toMatch(/^https:\/\/plantuml\.com\/plantuml\/svg\/[0-9A-Za-z_-]+$/);
    expect(encodePlantUml('@startuml\nAlice -> Bob\n@enduml')).not.toContain('%');
  });

  it('rejects server credentials and unsupported protocols', () => {
    expect(() => buildPlantUmlSvgUrl('ftp://example.com', 'x')).toThrow('HTTP 或 HTTPS');
    expect(() => buildPlantUmlSvgUrl('https://user:secret@example.com', 'x')).toThrow('HTTP 或 HTTPS');
  });

  describe('sanitizePlantUmlSvg', () => {
    it('removes active and external SVG content before DOM insertion', () => {
      const svg = sanitizePlantUmlSvg('<svg onload="alert(1)"><script>alert(1)</script><a href="https://evil.test"><rect style="fill:url(https://evil.test/x)" /></a><use href="#safe" /></svg>');
      expect(svg).not.toContain('script');
      expect(svg).not.toContain('onload');
      expect(svg).not.toContain('evil.test');
      expect(svg).toContain('href="#safe"');
    });

    it('removes <style> elements', () => {
      const svg = sanitizePlantUmlSvg('<svg><style>@import url("https://evil.test/steal.css");</style><rect /></svg>');
      expect(svg).not.toContain('style');
      expect(svg).not.toContain('@import');
      expect(svg).not.toContain('evil.test');
      expect(svg).toContain('<rect');
    });

    it('preserves safe inline styles', () => {
      const svg = sanitizePlantUmlSvg('<svg><rect style="stroke-dasharray: 5; fill: blue" /></svg>');
      expect(svg).toContain('stroke-dasharray: 5');
      expect(svg).toContain('fill: blue');
    });

    it('strips only url() declarations from style attributes', () => {
      const svg = sanitizePlantUmlSvg('<svg><rect style="stroke-dasharray: 5; fill:url(https://evil.test/x); fill: blue" /></svg>');
      expect(svg).toContain('stroke-dasharray: 5');
      expect(svg).toContain('fill: blue');
      expect(svg).not.toContain('evil.test');
    });

    it('removes style attribute entirely when all declarations contain url()', () => {
      const svg = sanitizePlantUmlSvg('<svg><rect style="fill:url(https://evil.test/x)" /></svg>');
      expect(svg).not.toContain('evil.test');
      expect(svg).not.toContain('style=');
    });
  });

  describe('isBlankPlantUmlSource', () => {
    it('returns true for whitespace-only source', () => {
      expect(isBlankPlantUmlSource('   ')).toBe(true);
      expect(isBlankPlantUmlSource('\n\t  ')).toBe(true);
    });

    it('returns true for bare @startuml/@enduml', () => {
      expect(isBlankPlantUmlSource('@startuml\n@enduml')).toBe(true);
      expect(isBlankPlantUmlSource('@startmindmap\n@endmindmap')).toBe(true);
    });

    it('returns false when source has content', () => {
      expect(isBlankPlantUmlSource('@startuml\nAlice -> Bob\n@enduml')).toBe(false);
      expect(isBlankPlantUmlSource('  @startuml\n  Alice -> Bob\n  @enduml  ')).toBe(false);
    });

    it('returns true for empty string', () => {
      expect(isBlankPlantUmlSource('')).toBe(true);
    });
  });

  describe('renderPlantUmlSvg', () => {
    it('does not insert a response when the server reports an error', async () => {
      const mockFetch = vi.mocked(tauriFetch);
      mockFetch.mockImplementation(async () => new Response('error', { status: 500 }));
      await expect(renderPlantUmlSvg('https://example.com/plantuml', '@startuml\n@enduml')).rejects.toThrow('HTTP 500');
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('uses Tauri HTTP plugin fetch with no-referrer policy', async () => {
      const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>';
      const mockFetch = vi.mocked(tauriFetch);
      mockFetch.mockImplementation(async () => new Response(svgContent, { status: 200 }));
      await renderPlantUmlSvg('https://example.com/plantuml', '@startuml\nAlice\n@enduml');
      expect(mockFetch).toHaveBeenCalledOnce();
      const [, options] = mockFetch.mock.calls[0]!;
      expect(options).toHaveProperty('referrerPolicy', 'no-referrer');
    });

    it('uses maxRedirections: 0 to block redirects', async () => {
      const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>';
      const mockFetch = vi.mocked(tauriFetch);
      mockFetch.mockImplementation(async () => new Response(svgContent, { status: 200 }));
      await renderPlantUmlSvg('https://example.com/plantuml', '@startuml\n@enduml');
      const [, options] = mockFetch.mock.calls[0]!;
      expect(options).toHaveProperty('maxRedirections', 0);
    });

    it('shows friendly timeout message for Tauri fetch abort', async () => {
      const mockFetch = vi.mocked(tauriFetch);
      mockFetch.mockRejectedValue(new Error('Request cancelled'));
      await expect(renderPlantUmlSvg('https://example.com/plantuml', '@startuml\n@enduml')).rejects.toThrow('渲染超时');
    });

    it('caches successful render results', async () => {
      const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>';
      const mockFetch = vi.mocked(tauriFetch);
      mockFetch.mockImplementation(async () => new Response(svgContent, { status: 200 }));

      const result1 = await renderPlantUmlSvg('https://example.com/plantuml', '@startuml\n@enduml');
      const result2 = await renderPlantUmlSvg('https://example.com/plantuml', '@startuml\n@enduml');
      expect(result1).toBe(result2);
      // Only one fetch call — second hit came from cache
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('invalidates cache when source changes', async () => {
      const svg1 = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="a" /></svg>';
      const svg2 = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="b" /></svg>';
      const mockFetch = vi.mocked(tauriFetch);
      mockFetch.mockImplementation(async () => new Response(svg1, { status: 200 }));

      const r1 = await renderPlantUmlSvg('https://example.com/plantuml', '@startuml\nA\n@enduml');
      mockFetch.mockImplementation(async () => new Response(svg2, { status: 200 }));
      const r2 = await renderPlantUmlSvg('https://example.com/plantuml', '@startuml\nB\n@enduml');
      expect(r1).toContain('id="a"');
      expect(r2).toContain('id="b"');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('invalidates cache when server URL changes', async () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>';
      const mockFetch = vi.mocked(tauriFetch);
      mockFetch.mockImplementation(async () => new Response(svg, { status: 200 }));

      await renderPlantUmlSvg('https://server1.com/plantuml', '@startuml\n@enduml');
      await renderPlantUmlSvg('https://server2.com/plantuml', '@startuml\n@enduml');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
