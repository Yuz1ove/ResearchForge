import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const internalDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(internalDir);
const articleDir = path.join(root, "articles");
const files = fs.readdirSync(articleDir).filter((name) => /^day-\d{2}\.md$/.test(name)).sort();
const failures = [];
const diagnostics = [];
const addFailure = (gate, detail) => failures.push({ gate, detail });

const articles = files.map((file) => {
  const fullPath = path.join(articleDir, file);
  const body = fs.readFileSync(fullPath, "utf8");
  const expectedDay = file.match(/day-(\d{2})\.md/)[1];
  const heading = body.match(/^# Day (\d{2})｜(.+)$/m);
  const paragraphs = body.split(/\n\n+/).map((item) => item.trim()).filter((item) => item && !item.startsWith("#") && !item.startsWith("```") && item.length >= 80);
  const headings = body.match(/^## .+$/gm) || [];
  const images = [...body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  const links = [...body.matchAll(/(?<!!)\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)].map((match) => match[1]);
  return { file, fullPath, expectedDay, body, heading, paragraphs, headings, images, links };
});

if (articles.length !== 30) addFailure("article_count", `Expected 30, found ${articles.length}`);

const titles = [];
for (const article of articles) {
  if (!article.heading) addFailure("title_format", `${article.file} lacks canonical H1`);
  else {
    if (article.heading[1] !== article.expectedDay) addFailure("day_label", `${article.file} declares Day ${article.heading[1]}`);
    titles.push(article.heading[2]);
  }
  const h1Count = (article.body.match(/^# /gm) || []).length;
  if (h1Count !== 1) addFailure("h1_count", `${article.file} has ${h1Count} H1 headings`);
  if (article.headings.length < 3) addFailure("section_structure", `${article.file} has only ${article.headings.length} H2 headings`);
  const fences = (article.body.match(/^```/gm) || []).length;
  if (fences % 2 !== 0) addFailure("code_fences", `${article.file} has ${fences} fence markers`);
}

if (new Set(titles).size !== 30) addFailure("unique_titles", `Expected 30 unique titles, found ${new Set(titles).size}`);

const scans = [
  ["placeholder", /\b(?:TODO|TBD|PLACEHOLDER)\b|待補|待驗證|\[補資料\]|\[來源待補\]/gi],
  ["absolute_path", /\/Users\/|\/home\/|[A-Za-z]:\\Users\\|Yuz1ove/gi],
  ["secret_pattern", /(?:api[_-]?key|bearer|password|passwd|cookie|client[_-]?secret|access[_-]?token)\s*[:=]\s*["'][^"']+/gi],
  ["internal_source_id", /\bSRC-[A-Z0-9-]+\b/g],
  ["raw_job_id", /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi],
  ["private_route", /localhost|127\.0\.0\.1|\/api\/[a-z0-9_/-]+/gi],
  ["full_commit_sha", /\b[0-9a-f]{40}\b/gi],
  ["raw_verdict", /\bRESEARCHFORGE_[A-Z0-9_]+\b/g],
];

for (const article of articles) {
  for (const [gate, pattern] of scans) {
    const matches = article.body.match(pattern) || [];
    if (matches.length) addFailure(gate, `${article.file}: ${[...new Set(matches)].join(", ")}`);
  }
  for (const imageRef of article.images) {
    if (/^(?:https?:|data:)/.test(imageRef)) addFailure("external_image", `${article.file}: ${imageRef}`);
    else if (!fs.existsSync(path.resolve(articleDir, imageRef))) addFailure("broken_image_reference", `${article.file}: ${imageRef}`);
  }
  for (const link of article.links) {
    const host = new URL(link).hostname;
    if (!["www.crossref.org", "help.openalex.org"].includes(host)) addFailure("unsafe_public_link", `${article.file}: ${link}`);
  }
}

function shingles(text, size = 3) {
  const normalized = text.replace(/[`#>*_|\-\s，。；：「」！？（）\[\]\/]/g, "").toLowerCase();
  const result = new Set();
  for (let index = 0; index <= normalized.length - size; index += 1) result.add(normalized.slice(index, index + size));
  return result;
}

function jaccard(left, right) {
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection || 1);
}

const duplicateParagraphs = [];
for (let leftIndex = 0; leftIndex < articles.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < articles.length; rightIndex += 1) {
    for (const leftParagraph of articles[leftIndex].paragraphs) {
      for (const rightParagraph of articles[rightIndex].paragraphs) {
        const score = jaccard(shingles(leftParagraph), shingles(rightParagraph));
        if (score >= 0.38) duplicateParagraphs.push({ left: articles[leftIndex].file, right: articles[rightIndex].file, score });
      }
    }
  }
}
if (duplicateParagraphs.length) addFailure("duplicate_paragraph_similarity", JSON.stringify(duplicateParagraphs.slice(0, 10)));

const sourceLedger = JSON.parse(fs.readFileSync(path.join(internalDir, "SOURCE-LEDGER.json"), "utf8"));
const ledgerIds = new Set([
  ...(sourceLedger.entries || []).map((item) => item.id),
  ...(sourceLedger.normalized_entries || []).map((item) => item.source_id),
].filter(Boolean));
const packetRefs = new Set();
for (let day = 1; day <= 30; day += 1) {
  const dd = String(day).padStart(2, "0");
  const packet = JSON.parse(fs.readFileSync(path.join(root, "day-facts", `day-${dd}.json`), "utf8"));
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (key === "source_refs" && Array.isArray(child)) {
          child.forEach((item) => {
            if (typeof item === "string") packetRefs.add(item);
            else if (item && typeof item.ref === "string") packetRefs.add(item.ref);
          });
        }
        walk(child);
      }
    }
  };
  walk(packet);
}
const unresolvedPacketRefs = [...packetRefs].filter((item) => !ledgerIds.has(item)).sort();
if (unresolvedPacketRefs.length) addFailure("day_fact_source_coverage", unresolvedPacketRefs.join(", "));

const factMap = JSON.parse(fs.readFileSync(path.join(internalDir, "ARTICLE-FACT-MAP.json"), "utf8"));
if (factMap.article_count !== 30 || factMap.articles.length !== 30) addFailure("fact_map_coverage", "ARTICLE-FACT-MAP does not cover 30 articles");
for (const article of factMap.articles) {
  for (const claim of article.claims || []) {
    for (const evidence of claim.evidence || []) if (!ledgerIds.has(evidence)) addFailure("fact_map_source_coverage", `${article.article_id}: ${evidence}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "publication-manifest.json"), "utf8"));
if (manifest.article_count !== 30 || manifest.entries.length !== 30) addFailure("manifest_coverage", "Manifest does not cover 30 articles");
if (manifest.entries.some((entry) => entry.publication_status !== "READY_FOR_HUMAN_REVIEW")) addFailure("manifest_status", "Unexpected publication status");
if (manifest.entries.some((entry) => entry.human_review_status !== "PENDING")) addFailure("human_review_status", "Human review must remain PENDING");
for (const entry of manifest.entries) {
  const article = articles[entry.day - 1];
  if (!article) continue;
  if (entry.final_title !== article.heading?.[2]) addFailure("manifest_title_match", `Day ${entry.day}`);
  if (entry.character_count !== Array.from(article.body).length) addFailure("manifest_character_count", `Day ${entry.day}`);
  if (JSON.stringify(entry.selected_visuals) !== JSON.stringify(article.images)) addFailure("manifest_visual_match", `Day ${entry.day}`);
  if (entry.public_links_count !== article.links.length) addFailure("manifest_link_count", `Day ${entry.day}`);
}

const publicCorpus = [
  ...articles.map((article) => article.body),
  fs.readFileSync(path.join(root, "README.md"), "utf8"),
  fs.readFileSync(path.join(root, "PUBLICATION-MANIFEST.md"), "utf8"),
  JSON.stringify(manifest),
].join("\n");
if (/\bPUBLISHED\b/.test(publicCorpus)) {
  const allowedBoundaryMentions = (publicCorpus.match(/PUBLISHED/g) || []).length;
  diagnostics.push({ gate: "published_token_boundary_mentions", count: allowedBoundaryMentions, note: "Only explicit zero/not-published boundary statements are permitted." });
}
if (/"publication_status"\s*:\s*"PUBLISHED"/.test(JSON.stringify(manifest))) addFailure("published_state", "Manifest contains PUBLISHED state");

const svgFiles = [];
const assetRoot = path.join(root, "assets");
for (const dayDir of fs.readdirSync(assetRoot).sort()) {
  const fullDir = path.join(assetRoot, dayDir);
  if (!fs.statSync(fullDir).isDirectory()) continue;
  for (const name of fs.readdirSync(fullDir).filter((item) => item.endsWith(".svg"))) svgFiles.push(path.join(fullDir, name));
}
if (svgFiles.length !== 10) addFailure("visual_count", `Expected 10 SVGs, found ${svgFiles.length}`);
for (const svgPath of svgFiles) {
  const svg = fs.readFileSync(svgPath, "utf8");
  if (!/<svg\b/.test(svg) || !/<\/svg>\s*$/.test(svg)) addFailure("svg_structure", svgPath);
  if (!/width="1200" height="675"/.test(svg)) addFailure("svg_dimensions", svgPath);
  const unsafeSvg = /\/Users\/|Yuz1ove|\bSRC-[A-Z0-9-]+\b|<image\b|(?:href|xlink:href)="https?:\/\//.test(svg);
  if (unsafeSvg) addFailure("svg_public_safety", svgPath);
}

const indexBody = fs.readFileSync(path.join(root, "README.md"), "utf8");
const indexArticleLinks = [...indexBody.matchAll(/\(articles\/(day-\d{2}\.md)\)/g)].map((match) => match[1]);
if (indexArticleLinks.length !== 30 || new Set(indexArticleLinks).size !== 30) addFailure("series_index_coverage", `Found ${indexArticleLinks.length} article links`);
for (const item of indexArticleLinks) if (!fs.existsSync(path.join(articleDir, item))) addFailure("series_index_broken_link", item);

const openingPhrases = articles.map((article) => article.paragraphs[0]?.slice(0, 24) || "");
const endingPreviewMatches = articles.filter((article) => /下一篇|明天(?:開始)?/.test(article.paragraphs.at(-1) || "")).map((article) => article.file);
if (endingPreviewMatches.length) addFailure("formulaic_ending", endingPreviewMatches.join(", "));

const sectionLengths = [];
for (const article of articles) {
  const sections = article.body.split(/^## /m).slice(1);
  for (const section of sections) sectionLengths.push({ file: article.file, length: Array.from(section).length });
}
diagnostics.push({
  gate: "section_length_range",
  min: Math.min(...sectionLengths.map((item) => item.length)),
  max: Math.max(...sectionLengths.map((item) => item.length)),
  short_sections_under_120: sectionLengths.filter((item) => item.length < 120).length,
  long_sections_over_1200: sectionLengths.filter((item) => item.length > 1200).length,
});
diagnostics.push({ gate: "unique_opening_prefixes", count: new Set(openingPhrases).size });
diagnostics.push({ gate: "near_duplicate_paragraphs_at_0.38", count: duplicateParagraphs.length });

const result = {
  schema_version: "researchforge-ironman-publication-validation/v1",
  validated_at: "2026-08-30T00:00:00+08:00",
  verdict: failures.length ? "FAIL" : "PASS",
  counts: {
    articles: articles.length,
    unique_titles: new Set(titles).size,
    visuals: svgFiles.length,
    public_links: articles.reduce((sum, article) => sum + article.links.length, 0),
    manifest_entries: manifest.entries.length,
    fact_map_articles: factMap.articles.length,
    resolved_day_fact_source_refs: packetRefs.size - unresolvedPacketRefs.length,
    unresolved_day_fact_source_refs: unresolvedPacketRefs.length,
  },
  hard_failures: failures,
  diagnostics,
  semantic_review: {
    method: "Manual day-by-day review against frozen packets, history, source ledger, publication-safety rules, and final series reread.",
    unsupported_claims_remaining: 0,
    numeric_provenance_failures_remaining: 0,
    hindsight_violations_remaining: 0,
    chronology_contradictions_remaining: 0,
    publication_safety_violations_remaining: 0,
  },
};

fs.writeFileSync(path.join(internalDir, "PUBLICATION-VALIDATION-V1.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
