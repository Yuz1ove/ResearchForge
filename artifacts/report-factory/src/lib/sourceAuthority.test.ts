import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "./sourceRecords.ts";
import {
  applySourceAuthorityAndLanguage,
  normalizeDisplayTextToZhTw,
  sourceAuthorityProfile,
  sourceDisplayLanguageLabel,
  sourceLanguageProfile,
} from "./sourceAuthority.ts";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "authority-source",
    title: "Sugar-sweetened beverage consumption and health outcomes",
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract: "This systematic review examines sugar-sweetened beverage consumption, caffeine, sugar intake, and health outcomes.",
    doi: "10.1000/authority",
    url: "https://doi.org/10.1000/authority",
    sourceType: "Crossref",
    reviewState: "pending",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    sourceCategory: "journal_article",
    relevanceLevel: "high",
    ...overrides,
  };
}

test("English DOI journal source can be high authority and labeled as English", () => {
  const profile = sourceAuthorityProfile(source());
  const language = sourceLanguageProfile(source());

  assert.equal(profile.level, "high");
  assert.equal(profile.label, "權威性高");
  assert.equal(language.language, "en");
  assert.equal(sourceDisplayLanguageLabel(source()), "英文來源");
});

test("international organization and government sources are not limited to Taiwan", () => {
  const profile = sourceAuthorityProfile(
    source({
      title: "WHO evidence on sugar-sweetened beverages and health",
      doi: null,
      url: "https://www.who.int/example/report",
      publisher: "World Health Organization",
      containerTitle: null,
      sourceCategory: "government_or_institution",
    }),
  );

  assert.equal(profile.level, "high");
  assert.equal(profile.label, "權威性高");
});

test("simplified Chinese sources are labeled and display text is converted to Traditional Chinese", () => {
  const simplified = source({
    title: "气候变化成因综述",
    abstract: "本研究报告整理温室气体、化石燃料与全球变暖的影响，并提出建议。",
    doi: null,
    url: "https://example.edu.cn/report",
    publisher: "Example University",
    sourceCategory: "academic_paper",
  });
  const language = sourceLanguageProfile(simplified);
  const assessed = applySourceAuthorityAndLanguage([simplified]);

  assert.equal(language.language, "zh-CN");
  assert.equal(language.label, "簡中來源");
  assert.match(assessed[0]?.abstract ?? "", /研究報告/);
  assert.match(assessed[0]?.abstract ?? "", /溫室氣體/);
  assert.match(normalizeDisplayTextToZhTw("气候变化与全球变暖影响"), /氣候變遷/);
});

test("missing abstracts are authority-check sources rather than recommended complete evidence", () => {
  const profile = sourceAuthorityProfile(
    source({
      abstract: null,
      title: "Climate change causes from greenhouse gas emissions",
    }),
  );

  assert.equal(profile.level, "insufficient_summary");
  assert.equal(profile.label, "摘要不足");
});

test("low relevance sources are downgraded even with metadata", () => {
  const profile = sourceAuthorityProfile(
    source({
      title: "Engineering management enrollment strategy",
      abstract: "This article has metadata but is not about the topic.",
      relevanceLevel: "off_topic",
      doi: "10.1000/offtopic",
    }),
  );

  assert.equal(profile.level, "low_relevance");
  assert.equal(profile.label, "低相關，已降權");
});
