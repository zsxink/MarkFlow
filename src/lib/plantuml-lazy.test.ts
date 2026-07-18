import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPlantUmlSvgUrl,
  encodePlantUml,
  renderPlantUmlSvg,
  sanitizePlantUmlSvg,
} from './plantuml-lazy';

afterEach(() => vi.unstubAllGlobals());

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

  it('removes active and external SVG content before DOM insertion', () => {
    const svg = sanitizePlantUmlSvg('<svg onload="alert(1)"><script>alert(1)</script><a href="https://evil.test"><rect style="fill:url(https://evil.test/x)" /></a><use href="#safe" /></svg>');
    expect(svg).not.toContain('script');
    expect(svg).not.toContain('onload');
    expect(svg).not.toContain('evil.test');
    expect(svg).toContain('href="#safe"');
  });

  it('does not insert a response when the server reports an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('error', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(renderPlantUmlSvg('https://example.com/plantuml', '@startuml\n@enduml')).rejects.toThrow('HTTP 500');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
