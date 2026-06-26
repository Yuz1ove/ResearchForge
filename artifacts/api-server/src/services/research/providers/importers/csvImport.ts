export function parseDelimitedRows(input: string): string[][] {
  return input
    .split(/\r?\n/)
    .map((row) => row.split(",").map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
}
