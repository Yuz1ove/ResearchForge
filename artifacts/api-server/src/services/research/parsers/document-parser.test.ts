import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { parseDocument } from "./document-parser";

test("DocumentParser: parses structured Markdown with headings and references", async () => {
  const md = `# 第一章 導論\n\n這是一段測試內文，評估微塑膠的生態毒理效應。[1]\n\n## 參考文獻\n\n1. Author et al. (2022). Environmental Science. https://doi.org/10.1016/j.scitotenv.2022.153730`;

  const parsed = await parseDocument({
    topic: "測試主題",
    markdown: md,
    mediaType: "text/markdown",
    fileName: "test-doc.md",
    sourceMode: "LIVE",
  });

  assert.equal(parsed.document.mediaType, "text/markdown");
  assert.equal(parsed.document.accessStatus, "USER_UPLOADED");
  assert.ok(parsed.blocks.length >= 3, "Should have heading, paragraph, and reference blocks");

  const headingBlock = parsed.blocks.find(b => b.blockType === "heading");
  assert.ok(headingBlock);
  assert.ok(headingBlock?.text.includes("第一章 導論"));

  const hasRef = parsed.blocks.some(b => b.blockType === "reference" && b.text.includes("Author et al."));
  assert.ok(hasRef, "Should find reference block containing Author et al.");
});

test("DocumentParser: parses OOXML DOCX generated with JSZip", async () => {
  const zip = new JSZip();
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t># 第一章 DOCX 測試標題</w:t></w:r></w:p>
    <w:p><w:r><w:t>這是由 OOXML 解析器讀取的段落內文。[1]</w:t></w:r></w:p>
    <w:p><w:r><w:t>## References</w:t></w:r></w:p>
    <w:p><w:r><w:t>1. Sample DOCX Reference. https://doi.org/10.1000/182</w:t></w:r></w:p>
  </w:body>
</w:document>`;
  zip.file("word/document.xml", documentXml);
  const docxBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const docxBase64 = docxBuffer.toString("base64");

  const parsed = await parseDocument({
    topic: "測試主題",
    fileBase64: docxBase64,
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileName: "generated-test.docx",
    sourceMode: "LIVE",
  });

  assert.equal(parsed.document.mediaType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.ok(parsed.blocks.length >= 3, "Should extract paragraphs from word/document.xml");
  assert.ok(parsed.blocks.some(b => b.text.includes("DOCX 測試標題")));
  assert.ok(parsed.blocks.some(b => b.text.includes("OOXML 解析器")));
});

test("DocumentParser: detects empty content and throws EMPTY_DOCUMENT", async () => {
  await assert.rejects(
    async () => {
      await parseDocument({
        topic: "測試主題",
        markdown: "   \n\n   ",
        mediaType: "text/markdown",
        sourceMode: "LIVE",
      });
    },
    { message: /Document is empty/ }
  );
});
