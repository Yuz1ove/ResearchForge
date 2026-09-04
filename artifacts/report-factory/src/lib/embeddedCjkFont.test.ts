import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadEmbeddedCjkFont } from "./embeddedCjkFont.ts";

function sfntTables(font: Uint8Array): Map<string, { offset: number; length: number }> {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const count = view.getUint16(4, false);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let index = 0; index < count; index += 1) {
    const directoryOffset = 12 + index * 16;
    const tag = new TextDecoder("latin1").decode(font.slice(directoryOffset, directoryOffset + 4));
    tables.set(tag, {
      offset: view.getUint32(directoryOffset + 8, false),
      length: view.getUint32(directoryOffset + 12, false),
    });
  }
  return tables;
}

test("cjk_render_preserved: bundled OFL font becomes a real embeddable sfnt", async () => {
  const font = await loadEmbeddedCjkFont();
  assert.ok(font);
  assert.deepEqual([...font.slice(0, 4)], [0, 1, 0, 0]);
  assert.ok(font.byteLength > 1_000_000);
  const tables = sfntTables(font);
  for (const required of ["cmap", "glyf", "head", "name", "OS/2"]) {
    assert.ok(tables.has(required), `sfnt must contain ${required}`);
  }
  const os2 = tables.get("OS/2")!;
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  assert.equal(view.getUint16(os2.offset + 8, false), 0, "OFL font must permit editable embedding");
});

test("cjk_render_preserved: portable LibreOffice path renders searchable Traditional Chinese", async (context) => {
  const runtimeRoot = join(
    homedir(),
    ".cache/codex-runtimes/codex-primary-runtime/dependencies",
  );
  const pythonBin = join(runtimeRoot, "python/bin");
  const python = existsSync(pythonBin)
    ? readdirSync(pythonBin)
        .filter((name) => /^python3\.\d+$/u.test(name))
        .sort()
        .reverse()
        .map((name) => join(pythonBin, name))
        .find(existsSync)
    : undefined;
  const documentsRoot = join(
    homedir(),
    ".codex/plugins/cache/openai-primary-runtime/documents",
  );
  const renderer = existsSync(documentsRoot)
    ? readdirSync(documentsRoot)
        .sort()
        .reverse()
        .map((version) => join(documentsRoot, version, "skills/documents/render_docx.py"))
        .find(existsSync)
    : undefined;
  if (!python || !renderer) {
    context.skip("Bundled LibreOffice document runtime is not installed in this environment.");
    return;
  }

  const work = mkdtempSync(join(tmpdir(), "researchforge-cjk-render-test-"));
  try {
    const font = await loadEmbeddedCjkFont();
    assert.ok(font);
    const D = await import("docx");
    const expectedText = "繁體中文輸出保真測試";
    const document = new D.Document({
      fonts: [{
        name: "Noto Sans TC Thin",
        data: font as unknown as Buffer,
      }],
      sections: [{
        children: [new D.Paragraph({
          children: [new D.TextRun({
            text: expectedText,
            font: {
              ascii: "Noto Sans TC Thin",
              hAnsi: "Noto Sans TC Thin",
              eastAsia: "Noto Sans TC Thin",
              cs: "Noto Sans TC Thin",
              hint: "eastAsia",
            },
            language: { value: "zh-TW", eastAsia: "zh-TW" },
          })],
        })],
      }],
    });
    const docxPath = join(work, "cjk-smoke.docx");
    writeFileSync(docxPath, await D.Packer.toBuffer(document));
    const outputDir = join(work, "rendered");
    const wrapper = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../scripts/render-docx-cjk-portable.py",
    );
    const result = spawnSync(python, [
      wrapper,
      docxPath,
      "--output-dir",
      outputDir,
      "--renderer",
      renderer,
      "--expected-text",
      expectedText,
    ], {
      encoding: "utf8",
      // First-run LibreOffice/font-cache initialization can exceed 30 seconds
      // on macOS even when the renderer completes successfully.
      timeout: 90_000,
      env: {
        ...process.env,
        TMPDIR: "/private/tmp",
        PATH: `${join(runtimeRoot, "bin/override")}:${process.env.PATH ?? ""}`,
      },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const validation = JSON.parse(
      readFileSync(join(outputDir, "cjk-render-validation.json"), "utf8"),
    ) as {
      status: string;
      embeddedFontVisibleInPdf: boolean;
      missingExpectedText: string[];
      renderedPages: number;
    };
    assert.equal(validation.status, "pass");
    assert.equal(validation.embeddedFontVisibleInPdf, true);
    assert.deepEqual(validation.missingExpectedText, []);
    assert.equal(validation.renderedPages, 1);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
