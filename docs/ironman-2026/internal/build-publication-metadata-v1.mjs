import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const internalDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(internalDir);
const articleDir = path.join(root, "articles");
const factDir = path.join(root, "day-facts");

const classifications = {
  1: "REVISE", 2: "POLISH", 3: "REVISE", 4: "KEEP", 5: "POLISH",
  6: "REVISE", 7: "KEEP", 8: "POLISH", 9: "REVISE", 10: "REVISE",
  11: "KEEP", 12: "KEEP", 13: "KEEP", 14: "POLISH", 15: "KEEP",
  16: "POLISH", 17: "KEEP", 18: "POLISH", 19: "POLISH", 20: "KEEP",
  21: "KEEP", 22: "POLISH", 23: "KEEP", 24: "KEEP", 25: "KEEP",
  26: "POLISH", 27: "POLISH", 28: "KEEP", 29: "KEEP", 30: "KEEP",
};

const dependencies = {
  1: null,
  2: "Day 01 generator origin",
  3: "Day 02 presentation-versus-evidence gap",
  4: "Day 03 source identity foundation",
  5: "Day 04 search candidates and diagnostics",
  6: "Day 05 one-way source-first workflow",
  7: "Day 06 query plan",
  8: "Day 07 normalized provider records",
  9: "Day 08 unique-work identity",
  10: "Day 09 reviewed source candidates",
  11: "Day 10 Evidence Cards",
  12: null,
  13: "Day 12 runtime boundary",
  14: null,
  15: "Day 14 direct paper workflow",
  16: "Day 15 integrated Writer verification path",
  17: "Day 16 fail-closed Writer gate",
  18: "Day 17 supported-content limit",
  19: "Day 18 case-scoped publication pass",
  20: "Day 19 fixed unseen cohort",
  21: "Day 20 first weak layer",
  22: "Day 21 typed evidence gaps",
  23: "Day 22 client-wait ambiguity",
  24: "Day 23 durable lifecycle truth",
  25: "Day 24 canonical admission owner",
  26: "Day 25 qualification stages",
  27: "Day 26 legal OA materialization",
  28: "Day 27 separated success units",
  29: "Day 28 hidden fan-out audit",
  30: "Day 29 control/content separation",
};

function readArticle(day) {
  const dd = String(day).padStart(2, "0");
  const articlePath = path.join(articleDir, `day-${dd}.md`);
  const body = fs.readFileSync(articlePath, "utf8");
  const titleMatch = body.match(new RegExp(`^# Day ${dd}｜(.+)$`, "m"));
  if (!titleMatch) throw new Error(`Missing canonical title for Day ${dd}`);
  const visuals = [...body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  const publicLinks = [...body.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)].map((match) => match[1]);
  return { dd, body, title: titleMatch[1], visuals, publicLinks };
}

function readFactPacket(day) {
  const dd = String(day).padStart(2, "0");
  return JSON.parse(fs.readFileSync(path.join(factDir, `day-${dd}.json`), "utf8"));
}

function buildClaims(packet) {
  const claims = [];
  const add = (claim, evidence, confidence, kind) => {
    if (!claim) return;
    claims.push({ public_claim: claim, evidence: [...new Set(evidence || [])], confidence, kind });
  };
  for (const item of packet.known_at_the_time || []) add(item.fact, item.source_refs, "HIGH", "KNOWN_AT_THE_TIME");
  for (const item of packet.implemented_at_the_time || []) add(item.fact, item.source_refs, "HIGH", "IMPLEMENTED_AT_THE_TIME");
  for (const item of packet.safe_public_facts || []) add(item.fact, item.source_refs, "HIGH", "SAFE_PUBLIC_FACT");
  for (const item of packet.observed_failures || []) add(item.symptom, item.source_refs, "HIGH", "OBSERVED_FAILURE");
  for (const item of packet.tests_and_metrics || []) add(`${item.test_or_metric} Result: ${item.result}.`, item.source_refs, "HIGH", "TEST_OR_METRIC");
  for (const item of packet.safe_numbers || []) add(`${item.value}: ${item.meaning}.`, item.source_refs, "HIGH", "SAFE_NUMBER");
  for (const item of packet.retrospective_notes || []) add(item.note, item.source_refs, "RETROSPECTIVE", "LATER_INTERPRETATION");
  return claims;
}

const manifestEntries = [];
const factMapArticles = [];

for (let day = 1; day <= 30; day += 1) {
  const article = readArticle(day);
  const packet = readFactPacket(day);
  const articlePath = `articles/day-${article.dd}.md`;
  manifestEntries.push({
    day,
    final_title: article.title,
    article_path: articlePath,
    publication_status: "READY_FOR_HUMAN_REVIEW",
    character_count: Array.from(article.body).length,
    selected_visuals: article.visuals,
    public_links_count: article.publicLinks.length,
    public_links: article.publicLinks,
    factual_review_status: "PASS",
    hindsight_review_status: "PASS",
    safety_review_status: "PASS",
    human_review_status: "PENDING",
    dependency_on_previous_day: dependencies[day],
    publication_notes: `${classifications[day]} in Publication Review V1; canonical Markdown remains the publication source.`,
  });
  factMapArticles.push({
    article_id: `day-${article.dd}`,
    article_title: article.title,
    packet_path: `day-facts/day-${article.dd}.json`,
    evidence_boundary: packet.evidence_boundary,
    forbidden_hindsight_terms: packet.terminology_forbidden_due_to_hindsight,
    publication_risks: packet.publication_risks,
    claims: buildClaims(packet),
  });
}

const manifest = {
  schema_version: "researchforge-ironman-publication-manifest/v1",
  generated_at: "2026-08-30T00:00:00+08:00",
  canonical_article_directory: "docs/ironman-2026/articles",
  series_status: "READY_FOR_HUMAN_REVIEW",
  live_publication_authorized: false,
  event_metadata_status: "UNVERIFIED_HTTP_403",
  article_count: manifestEntries.length,
  status_distribution: { READY_FOR_HUMAN_REVIEW: manifestEntries.length },
  entries: manifestEntries,
};

const factMap = {
  schema_version: "researchforge-article-fact-map/v2",
  generated_at: "2026-08-30T00:00:00+08:00",
  policy: "The frozen day packet is the authority for each article. Later interpretations must remain explicit. Unsupported prose is removed rather than inferred.",
  article_count: factMapArticles.length,
  articles: factMapArticles,
};

fs.writeFileSync(path.join(root, "publication-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(internalDir, "ARTICLE-FACT-MAP.json"), `${JSON.stringify(factMap, null, 2)}\n`);

const rows = manifestEntries.map((entry) => {
  const visual = entry.selected_visuals.length ? entry.selected_visuals.map((item) => `\`${item}\``).join("<br>") : "—";
  const dependency = entry.dependency_on_previous_day || "—";
  return `| ${String(entry.day).padStart(2, "0")} | ${entry.final_title} | \`${entry.article_path}\` | ${entry.publication_status} | ${entry.character_count} | ${visual} | ${entry.public_links_count} | PASS | PASS | PASS | PENDING | ${dependency} |`;
});

const manifestMarkdown = `# ResearchForge Ironman Publication Manifest\n\n` +
  `Generated: 2026-08-30 (Asia/Taipei)\n\n` +
  `Canonical publication source: \`docs/ironman-2026/articles/day-XX.md\`. This manifest describes local editorial readiness only. It does not grant human approval, platform approval, or publication authorization.\n\n` +
  `Series status: \`READY_FOR_HUMAN_REVIEW\`\n\n` +
  `## 30-day manifest\n\n` +
  `| Day | Final title | Article path | Publication status | Characters | Visuals | Public links | Factual | Hindsight | Safety | Human review | Material dependency |\n` +
  `|---:|---|---|---|---:|---|---:|---|---|---|---|---|\n` + rows.join("\n") + `\n\n` +
  `## Distribution and boundaries\n\n` +
  `- READY_FOR_HUMAN_REVIEW: 30\n` +
  `- PUBLISHED: 0\n` +
  `- APPROVED_BY_USER: 0\n` +
  `- Human review: PENDING for 30/30\n` +
  `- iThome event metadata: UNVERIFIED_HTTP_403\n` +
  `- Live publication authorization: NOT_GRANTED\n`;

fs.writeFileSync(path.join(root, "PUBLICATION-MANIFEST.md"), manifestMarkdown);

console.log(JSON.stringify({
  manifest_entries: manifestEntries.length,
  fact_map_articles: factMapArticles.length,
  ready_for_human_review: manifestEntries.filter((entry) => entry.publication_status === "READY_FOR_HUMAN_REVIEW").length,
}, null, 2));
