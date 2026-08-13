const BRACKETED_MARKER_PATTERN =
  /[\[\uff3b(\uff08]\s*[sS\uff33\uff53]\s*([0-9\uff10-\uff19]+)\s*[\]\uff3d)\uff09]/gu;
const CURLY_MARKER_PATTERN =
  /\{\{?\s*[sS\uff33\uff53]\s*([0-9\uff10-\uff19]+)\s*\}?\}/gu;
const SOURCE_BRACKET_MARKER_PATTERN =
  /[\[\uff3b]\s*source\s*:\s*([0-9\uff10-\uff19]+)\s*[\]\uff3d]/giu;
const LEGACY_ID_MARKER_PATTERN = /\b(?:source|citation)[_-]([0-9]+)\b/giu;
const BARE_MARKER_PATTERN =
  /(?<![\p{L}\p{N}\[\uff3b(\uff08])[sS\uff33\uff53]\s*([0-9\uff10-\uff19]+)(?![\p{L}\p{N}\]\uff3d)\uff09])/gu;

function asciiDigits(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code >= 0xff10 && code <= 0xff19
      ? String(code - 0xff10)
      : character;
  }).join("");
}

function markerFromDigits(value: string | undefined): string {
  const digits = asciiDigits(value ?? "").replace(/^0+(?=\d)/u, "");
  return digits ? `[S${digits}]` : "";
}

function looksLikeScientificLabel(
  marker: string,
  offset: number,
  source: string,
): boolean {
  const before = source.slice(0, offset);
  const after = source.slice(offset + marker.length);
  return (
    /(?:Table|Figure|Fig\.?|Supplement(?:ary)?|Appendix|\u8868|\u5716|\u9644\u8868|\u9644\u5716|\u9644\u9304)\s*$/iu.test(
      before,
    ) || !/^\s*(?:[\u3002\uff01\uff1f!?\uff1b;\uff0c,\u3001]|$)/u.test(after)
  );
}

/**
 * Normalizes every resolvable legacy citation token to the internal canonical
 * marker. The reader-facing renderer later resolves this source ordinal to a
 * source identity and emits a numeric reference such as `[1]`.
 */
export function canonicalizeCitationMarkersInText(value: string): string {
  return value
    .replace(CURLY_MARKER_PATTERN, (_match, digits: string) => markerFromDigits(digits))
    .replace(SOURCE_BRACKET_MARKER_PATTERN, (_match, digits: string) => markerFromDigits(digits))
    .replace(LEGACY_ID_MARKER_PATTERN, (_match, digits: string) => markerFromDigits(digits))
    .replace(BRACKETED_MARKER_PATTERN, (_match, digits: string) => markerFromDigits(digits))
    .replace(
      BARE_MARKER_PATTERN,
      (marker, digits: string, offset: number, source: string) =>
        looksLikeScientificLabel(marker, offset, source)
          ? marker
          : markerFromDigits(digits),
    );
}

const UNRESOLVED_INTERNAL_TOKEN_PATTERNS = [
  /\{\{?\s*[sS]\s*\d+\s*\}?\}/iu,
  /\[\s*source\s*:\s*\d+\s*\]/iu,
  /\b(?:source|citation)_\d+\b/iu,
  /\bturn\d+(?:search|fetch|view)\d+\b/iu,
  /【\d+\u2020L\d+(?:-L\d+)?】/u,
  /\bsourceId\b/iu,
  /\bevidenceSetHash\b/iu,
  /\bevidenceCardId\b/iu,
  /\breasonCode\b/iu,
] as const;

export function unresolvedInternalCitationTokens(value: string): string[] {
  return UNRESOLVED_INTERNAL_TOKEN_PATTERNS
    .filter((pattern) => pattern.test(value))
    .map((pattern) => value.match(pattern)?.[0] ?? "")
    .filter(Boolean);
}

export function canonicalCitationMarker(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  const normalized = canonicalizeCitationMarkersInText(value);
  const match = normalized.match(/\[S(\d+)\]/u);
  return match?.[1] ? `[S${match[1]}]` : null;
}

export function extractCanonicalCitationMarkers(value: string): string[] {
  return Array.from(
    new Set(
      Array.from(canonicalizeCitationMarkersInText(value).matchAll(/\[S(\d+)\]/gu))
        .map((match) => match[1] ? `[S${match[1]}]` : null)
        .filter((marker): marker is string => Boolean(marker)),
    ),
  );
}
