export function cleanWhitespace(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function normalizeTextKey(value: string | null | undefined): string {
  return cleanWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTitleKey(value: string | null | undefined): string {
  return normalizeTextKey(value).replace(/^[\s:.]+|[\s:.]+$/g, "");
}

export function normalizeDoi(value: string | null | undefined): string | undefined {
  const normalized = cleanWhitespace(value).replace(
    /^https?:\/\/(dx\.)?doi\.org\//i,
    "",
  );
  return normalized || undefined;
}

export function normalizedLanguage(value: string | null | undefined): string | undefined {
  const normalized = cleanWhitespace(value).toLowerCase();
  return normalized || undefined;
}

export function firstAuthorKey(authors: string[]): string | undefined {
  const author = normalizeTextKey(authors[0]);
  return author || undefined;
}
