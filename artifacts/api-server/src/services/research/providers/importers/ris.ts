export function parseRisEntries(input: string): string[] {
  return input
    .split(/\nER  -\s*/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => `${entry}\nER  -`);
}
