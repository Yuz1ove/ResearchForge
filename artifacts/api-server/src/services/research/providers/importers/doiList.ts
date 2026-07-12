export function parseDoiList(input: string): string[] {
  return input
    .split(/\r?\n|,|;/)
    .map((value) => value.trim())
    .filter((value) => /^10\.\S+\/\S+$/i.test(value));
}
