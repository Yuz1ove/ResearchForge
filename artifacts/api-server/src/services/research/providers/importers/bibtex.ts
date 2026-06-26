export function parseBibtexEntries(input: string): string[] {
  return input
    .split(/@(?=\w+\{)/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => `@${entry}`);
}
