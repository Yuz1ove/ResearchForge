/**
 * AI assistance disclosure: Portions of this module were drafted with OpenAI
 * Codex. See /AI_ASSISTANCE.md for the verification performed.
 */

const NOTO_SANS_TC_WOFF_SPECIFIER =
  "@fontsource/noto-sans-tc/files/noto-sans-tc-chinese-traditional-400-normal.woff";

const WOFF_SIGNATURE = 0x774f4646;
const TRUE_TYPE_SIGNATURE = 0x00010000;
const CHECKSUM_MAGIC = 0xb1b0afba;

interface WoffTable {
  tag: number;
  offset: number;
  compressedLength: number;
  originalLength: number;
  originalChecksum: number;
  sfntOffset: number;
  data: Uint8Array;
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

function writeTag(view: DataView, offset: number, tag: number): void {
  view.setUint32(offset, tag, false);
}

async function inflateZlib(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser cannot decode the embedded CJK font.");
  }
  const input = new Blob([data as BlobPart]).stream();
  const output = input.pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(output).arrayBuffer());
}

/** Convert a standards-compliant WOFF 1.0 font into an sfnt/TrueType font. */
export async function woffToSfnt(woff: Uint8Array): Promise<Uint8Array> {
  if (woff.byteLength < 44) throw new Error("Invalid WOFF: header is truncated.");
  const source = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (source.getUint32(0, false) !== WOFF_SIGNATURE) {
    throw new Error("Invalid WOFF: signature does not match WOFF 1.0.");
  }
  const flavor = source.getUint32(4, false);
  const declaredLength = source.getUint32(8, false);
  const tableCount = source.getUint16(12, false);
  const declaredSfntSize = source.getUint32(16, false);
  if (declaredLength > woff.byteLength || tableCount === 0 || 44 + tableCount * 20 > woff.byteLength) {
    throw new Error("Invalid WOFF: directory is inconsistent.");
  }

  const tables: WoffTable[] = [];
  let sfntOffset = 12 + tableCount * 16;
  for (let index = 0; index < tableCount; index += 1) {
    const directoryOffset = 44 + index * 20;
    const offset = source.getUint32(directoryOffset + 4, false);
    const compressedLength = source.getUint32(directoryOffset + 8, false);
    const originalLength = source.getUint32(directoryOffset + 12, false);
    if (
      compressedLength === 0 ||
      originalLength === 0 ||
      compressedLength > originalLength ||
      offset + compressedLength > woff.byteLength
    ) {
      throw new Error("Invalid WOFF: table bounds are inconsistent.");
    }
    const compressed = woff.slice(offset, offset + compressedLength);
    const data = compressedLength === originalLength
      ? compressed
      : await inflateZlib(compressed);
    if (data.byteLength !== originalLength) {
      throw new Error("Invalid WOFF: decompressed table length does not match its directory entry.");
    }
    tables.push({
      tag: source.getUint32(directoryOffset, false),
      offset,
      compressedLength,
      originalLength,
      originalChecksum: source.getUint32(directoryOffset + 16, false),
      sfntOffset,
      data,
    });
    sfntOffset += align4(originalLength);
  }
  if (declaredSfntSize !== sfntOffset) {
    throw new Error("Invalid WOFF: reconstructed sfnt size does not match the header.");
  }

  const sfnt = new Uint8Array(sfntOffset);
  const target = new DataView(sfnt.buffer);
  target.setUint32(0, flavor || TRUE_TYPE_SIGNATURE, false);
  target.setUint16(4, tableCount, false);
  const maximumPowerOfTwo = 2 ** Math.floor(Math.log2(tableCount));
  target.setUint16(6, maximumPowerOfTwo * 16, false);
  target.setUint16(8, Math.floor(Math.log2(maximumPowerOfTwo)), false);
  target.setUint16(10, tableCount * 16 - maximumPowerOfTwo * 16, false);

  for (const [index, table] of tables.entries()) {
    const directoryOffset = 12 + index * 16;
    writeTag(target, directoryOffset, table.tag);
    target.setUint32(directoryOffset + 4, table.originalChecksum, false);
    target.setUint32(directoryOffset + 8, table.sfntOffset, false);
    target.setUint32(directoryOffset + 12, table.originalLength, false);
    sfnt.set(table.data, table.sfntOffset);
  }

  // The offsets in the reconstructed sfnt can differ from the source font, so
  // recompute head.checkSumAdjustment after zeroing it.
  const headTag = 0x68656164;
  const head = tables.find((table) => table.tag === headTag);
  if (head && head.originalLength >= 12) {
    target.setUint32(head.sfntOffset + 8, 0, false);
    let checksum = 0;
    for (let offset = 0; offset < sfnt.byteLength; offset += 4) {
      checksum = (checksum + target.getUint32(offset, false)) >>> 0;
    }
    target.setUint32(head.sfntOffset + 8, (CHECKSUM_MAGIC - checksum) >>> 0, false);
  }
  return sfnt;
}

async function loadWoffBytes(): Promise<Uint8Array> {
  if (typeof window !== "undefined") {
    const asset = await import(
      "@fontsource/noto-sans-tc/files/noto-sans-tc-chinese-traditional-400-normal.woff?url"
    );
    const response = await fetch(asset.default);
    if (!response.ok) throw new Error(`Unable to load embedded CJK font (${response.status}).`);
    return new Uint8Array(await response.arrayBuffer());
  }

  const [{ readFile }, { createRequire }] = await Promise.all([
    import("node:fs/promises"),
    import("node:module"),
  ]);
  const require = createRequire(import.meta.url);
  return new Uint8Array(await readFile(require.resolve(NOTO_SANS_TC_WOFF_SPECIFIER)));
}

let cachedFont: Promise<Uint8Array | null> | null = null;

/** Load an OFL-licensed, real sfnt font suitable for OOXML embedding. */
export function loadEmbeddedCjkFont(): Promise<Uint8Array | null> {
  cachedFont ??= loadWoffBytes()
    .then(woffToSfnt)
    .catch((error) => {
      console.warn("ResearchForge could not embed its CJK font; DOCX will use declared fallbacks.", error);
      return null;
    });
  return cachedFont;
}
