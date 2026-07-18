/** Lazy facade: the PlantUML client is loaded only for configured PlantUML blocks. */
export async function renderPlantUml(serverUrl: string, source: string): Promise<string> {
  const { renderPlantUmlSvg } = await import('./plantuml-lazy');
  return renderPlantUmlSvg(serverUrl, source);
}
