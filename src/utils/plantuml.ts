/** Returns true if the source is effectively empty (whitespace or bare @startuml/@enduml). */
export function isBlankPlantUmlSource(source: string): boolean {
  const stripped = source
    .replace(/@start\w*/gi, '')
    .replace(/@end\w*/gi, '')
    .trim();
  return stripped.length === 0;
}
