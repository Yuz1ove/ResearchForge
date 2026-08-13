import type { ReportWorkspace } from "./reportWorkspace.ts";
import {
  canonicalSourceKeyForSource,
  type SourceRecord,
} from "./sourceRecords.ts";
import {
  exportSafeReportSectionText,
  readerFacingNaturalParagraphs,
  visibleReportSectionText,
} from "./reportPreviewGuards.ts";
import {
  sanitizeZhTwReportProse,
  UNTRANSLATED_EVIDENCE_NOTICE,
} from "./zhTwReportText.ts";
import {
  buildStableCitationMarkerMap,
  extractCitationMarkers,
  sourceIdsFromCitationMarkers,
} from "./sectionEvidencePolicy.ts";
import {
  buildFormalReportDocument,
  formalReportSectionContent,
  formalReportSectionSequence,
  type FigureSpec,
  type FormalReportDocument,
  type FormalReportTable,
} from "./formalReportDocument.ts";
import {
  buildReaderCitationEntries,
  stripReaderCitationTokens,
} from "./readerCitations.ts";

export interface DetailedReportCitation {
  marker: string;
  source: SourceRecord;
  /** Stable internal id used to bind this reader citation to its reference. */
  citationId?: string;
  /** Reader-facing author-year label. `marker` remains for legacy workspaces. */
  label?: string;
  href?: string | null;
  anchorId?: string;
}

export interface DetailedReportCitationRewrite {
  inputMarker: string;
  canonicalMarker: string;
  sourceId: string;
  canonicalSourceKey: string;
}

export interface DetailedReportCitationIntegrity {
  status: "pass" | "blocked";
  unknownMarkers: string[];
  ambiguousMarkers: string[];
  rewrites: DetailedReportCitationRewrite[];
}

export interface DetailedReportCitationRegistry {
  /** Only canonical sources that are actually cited in reader-facing prose. */
  sources: SourceRecord[];
  markerMap: Map<string, string>;
  sourceIdByInputMarker: Map<string, string>;
  integrity: DetailedReportCitationIntegrity;
  rewriteText: (value: string) => string;
}

export interface DetailedReportSubsection {
  sectionId: string;
  title: string;
  paragraphs: string[];
  /** Citation metadata parallel to `paragraphs`, preserving block-level scope. */
  citationGroups?: DetailedReportCitation[][];
}

export interface DetailedReportParagraph {
  id: string;
  title: string;
  body: string;
  subsections: DetailedReportSubsection[];
  citations: DetailedReportCitation[];
  tables: FormalReportTable[];
  figures: FigureSpec[];
  /** Canonical evidence-first reading order (guide → visual → analysis). */
  orderedContent?: DetailedReportContentNode[];
}

export type DetailedReportContentNode =
  | {
      nodeType: "paragraph";
      text: string;
      citations: DetailedReportCitation[];
      citationSegments?: Array<{
        text: string;
        citations: DetailedReportCitation[];
      }>;
      paragraphRole?: "reading_guide" | "narrative" | "interpretation" | "boundary";
    }
  | { nodeType: "table"; table: FormalReportTable }
  | { nodeType: "figure"; figure: FigureSpec };

const READER_SECTION_CONFIGS: Array<{
  id: DetailedReportParagraph["id"];
  title: string;
  sections: Array<{ sectionId: string; readerTitle: string }>;
}> = [
  {
    id: "introduction",
    title: "研究背景",
    sections: [{ sectionId: "introduction", readerTitle: "研究背景" }],
  },
  {
    id: "research_question",
    title: "研究問題",
    sections: [{ sectionId: "research_question", readerTitle: "研究問題" }],
  },
  {
    id: "literature_review",
    title: "文獻探討",
    sections: [{ sectionId: "literature_review", readerTitle: "文獻探討" }],
  },
  {
    id: "methodology",
    title: "研究方法",
    sections: [{ sectionId: "methodology", readerTitle: "研究方法" }],
  },
  {
    id: "findings",
    title: "主要發現",
    sections: [{ sectionId: "findings", readerTitle: "主要發現" }],
  },
  {
    id: "discussion",
    title: "綜合討論",
    sections: [{ sectionId: "discussion", readerTitle: "綜合討論" }],
  },
  {
    id: "limitations",
    title: "研究限制",
    sections: [{ sectionId: "limitations", readerTitle: "研究限制" }],
  },
  {
    id: "conclusion",
    title: "結論與建議",
    sections: [{ sectionId: "conclusion", readerTitle: "結論與建議" }],
  },
];

const SUMMARY_SECTION_GROUPS: Array<{
  ids: DetailedReportParagraph["id"][];
  preferLast?: boolean;
}> = [
  { ids: ["introduction", "research_question", "literature_review"] },
  { ids: ["methodology", "findings"] },
  { ids: ["discussion", "limitations", "conclusion"], preferLast: true },
];

const INLINE_CITATION_PATTERN = /[\[\uff3b]\s*[S\uff33]\s*[0-9\uff10-\uff19]+\s*[\]\uff3d]/giu;

function normalizeIdentity(value: string | null | undefined): string {
  return value?.normalize("NFKC").trim().toLocaleLowerCase() ?? "";
}

function markerOrdinal(marker: string): number {
  return Number(marker.match(/\d+/u)?.[0] ?? Number.MAX_SAFE_INTEGER);
}

function sortedMarkers(markers: Iterable<string>): string[] {
  return Array.from(new Set(markers)).sort(
    (left, right) => markerOrdinal(left) - markerOrdinal(right) || left.localeCompare(right),
  );
}

function normalizedMarkers(value: string | null | undefined): string[] {
  return value ? extractCitationMarkers(value) : [];
}

function sourceAliases(source: SourceRecord): string[] {
  return Array.from(new Set([
    source.id,
    source.canonicalSourceIdentity,
    source.dedupeKey,
    canonicalSourceKeyForSource(source),
    source.doi ? `doi:${source.doi}` : "",
  ].map(normalizeIdentity).filter(Boolean)));
}

function evidenceAliases(
  card: ReportWorkspace["evidenceCards"][number],
): string[] {
  return Array.from(new Set([
    card.sourceId,
    card.canonicalSourceKey,
    card.dedupeKey,
    card.citationKey,
    card.doi ? `doi:${card.doi}` : "",
  ].map(normalizeIdentity).filter(Boolean)));
}

function paragraphText(value: string): string {
  return sanitizeZhTwReportProse(value).replace(/\s+/gu, " ").trim();
}

function reportSentences(text: string): string[] {
  return (paragraphText(text).match(/[^。！？!?]+[。！？!?]?/gu) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Build the reader-facing citation registry from sources that can actually
 * contribute evidence. Legacy/manual workspaces without evidence cards fall
 * back to the source ids already bound to draft sections. Keeping this in the
 * detailed-report layer lets preview, summary, and every export resolve the
 * same marker against the same source set.
 */
export function buildDetailedReportCitationRegistry(
  workspace: ReportWorkspace,
): DetailedReportCitationRegistry {
  const canonicalSourceByKey = new Map<string, SourceRecord>();
  const canonicalKeyByAlias = new Map<string, string>();

  for (const source of workspace.acceptedSources) {
    const canonicalKey = normalizeIdentity(canonicalSourceKeyForSource(source));
    if (!canonicalKey) continue;
    if (!canonicalSourceByKey.has(canonicalKey)) {
      canonicalSourceByKey.set(canonicalKey, source);
    }
    for (const alias of sourceAliases(source)) canonicalKeyByAlias.set(alias, canonicalKey);
  }

  const resolveCanonicalKey = (aliases: Array<string | null | undefined>): string | null => {
    for (const alias of aliases.map(normalizeIdentity).filter(Boolean)) {
      const canonicalKey = canonicalKeyByAlias.get(alias);
      if (canonicalKey) return canonicalKey;
      if (canonicalSourceByKey.has(alias)) return alias;
    }
    return null;
  };

  const evidenceCanonicalKeys = new Set(
    workspace.evidenceCards
      .map((card) => resolveCanonicalKey(evidenceAliases(card)))
      .filter((key): key is string => Boolean(key)),
  );
  const draftCanonicalKeys = new Set(
    workspace.draft.sections
      .filter((section) => section.sectionId !== "references")
      .flatMap((section) => [...section.citationIds, ...section.supportingSourceIds])
      .map((sourceId) => resolveCanonicalKey([sourceId]))
      .filter((key): key is string => Boolean(key)),
  );
  const citableCanonicalKeys = evidenceCanonicalKeys.size > 0
    ? evidenceCanonicalKeys
    : draftCanonicalKeys;

  type MarkerBinding = { canonicalKey: string; priority: "evidence" | "section" };
  const bindingByInputMarker = new Map<string, MarkerBinding>();
  const ambiguousCanonicalKeysByMarker = new Map<string, Set<string>>();

  const bindMarker = (
    marker: string,
    canonicalKey: string | null,
    priority: MarkerBinding["priority"],
  ) => {
    if (!canonicalKey || !citableCanonicalKeys.has(canonicalKey)) return;
    const existing = bindingByInputMarker.get(marker);
    if (!existing) {
      bindingByInputMarker.set(marker, { canonicalKey, priority });
      return;
    }
    if (existing.canonicalKey === canonicalKey) return;
    // Evidence-card identity is authoritative. Section arrays are only a
    // compatibility fallback because older merge paths could already have
    // interpreted the API marker with a different source ordering.
    if (existing.priority === "evidence" && priority === "section") return;
    if (existing.priority === "section" && priority === "evidence") {
      bindingByInputMarker.set(marker, { canonicalKey, priority });
      ambiguousCanonicalKeysByMarker.delete(marker);
      return;
    }
    const conflicts = ambiguousCanonicalKeysByMarker.get(marker) ?? new Set<string>();
    conflicts.add(existing.canonicalKey);
    conflicts.add(canonicalKey);
    ambiguousCanonicalKeysByMarker.set(marker, conflicts);
  };

  for (const card of workspace.evidenceCards) {
    const canonicalKey = resolveCanonicalKey(evidenceAliases(card));
    for (const marker of [
      ...normalizedMarkers(card.citationMarker),
      ...normalizedMarkers(card.citationText),
    ]) {
      bindMarker(marker, canonicalKey, "evidence");
    }
  }

  const evidenceCardById = new Map(
    workspace.evidenceCards.map((card) => [card.id, card] as const),
  );
  for (const section of workspace.draft.sections) {
    if (section.sectionId === "references") continue;
    const markers = sortedMarkers(section.citationMarkers.flatMap(normalizedMarkers));
    if (markers.length === section.citationIds.length) {
      markers.forEach((marker, index) => {
        const citationId = section.citationIds[index];
        bindMarker(marker, resolveCanonicalKey([citationId]), "section");
      });
    }

    const sectionEvidenceKeys = new Set(
      section.evidenceCardIds
        .map((id) => evidenceCardById.get(id))
        .filter((card): card is ReportWorkspace["evidenceCards"][number] => Boolean(card))
        .map((card) => resolveCanonicalKey(evidenceAliases(card)))
        .filter((key): key is string => Boolean(key)),
    );
    if (markers.length === 1 && sectionEvidenceKeys.size === 1) {
      bindMarker(markers[0]!, Array.from(sectionEvidenceKeys)[0]!, "section");
    }
  }

  const readerTexts = workspace.draft.sections
    .filter((section) => section.sectionId !== "title" && section.sectionId !== "references")
    .map((section) => exportSafeReportSectionText(section))
    .filter(Boolean);
  const usedInputMarkers = sortedMarkers(readerTexts.flatMap(normalizedMarkers));
  const usedAmbiguousMarkers = sortedMarkers(
    usedInputMarkers.filter((marker) => ambiguousCanonicalKeysByMarker.has(marker)),
  );
  const ambiguousSet = new Set(usedAmbiguousMarkers);
  const unknownMarkers = sortedMarkers(
    usedInputMarkers.filter(
      (marker) => !ambiguousSet.has(marker) && !bindingByInputMarker.has(marker),
    ),
  );

  const citedCanonicalKeys = new Set(
    usedInputMarkers
      .filter((marker) => !ambiguousSet.has(marker))
      .map((marker) => bindingByInputMarker.get(marker)?.canonicalKey)
      .filter((key): key is string => Boolean(key)),
  );
  const citedSources = Array.from(citedCanonicalKeys)
    .map((key) => canonicalSourceByKey.get(key))
    .filter((source): source is SourceRecord => Boolean(source));
  const unsortedMarkerMap = buildStableCitationMarkerMap(citedSources);
  const sources = [...citedSources].sort((left, right) => {
    const leftMarker = unsortedMarkerMap.get(left.id) ?? "";
    const rightMarker = unsortedMarkerMap.get(right.id) ?? "";
    return markerOrdinal(leftMarker) - markerOrdinal(rightMarker);
  });
  const markerMap = buildStableCitationMarkerMap(sources);
  const sourceIdByCanonicalKey = new Map(
    sources.map((source) => [
      normalizeIdentity(canonicalSourceKeyForSource(source)),
      source.id,
    ] as const),
  );
  const sourceIdByInputMarker = new Map<string, string>();
  const canonicalMarkerByInputMarker = new Map<string, string>();
  const rewrites: DetailedReportCitationRewrite[] = [];

  for (const inputMarker of usedInputMarkers) {
    if (ambiguousSet.has(inputMarker)) continue;
    const canonicalKey = bindingByInputMarker.get(inputMarker)?.canonicalKey;
    if (!canonicalKey) continue;
    const sourceId = sourceIdByCanonicalKey.get(canonicalKey);
    const canonicalMarker = sourceId ? markerMap.get(sourceId) : null;
    if (!sourceId || !canonicalMarker) continue;
    sourceIdByInputMarker.set(inputMarker, sourceId);
    canonicalMarkerByInputMarker.set(inputMarker, canonicalMarker);
    rewrites.push({
      inputMarker,
      canonicalMarker,
      sourceId,
      canonicalSourceKey: canonicalSourceKeyForSource(
        canonicalSourceByKey.get(canonicalKey)!,
      ),
    });
  }

  const rewriteText = (value: string): string =>
    value.replace(INLINE_CITATION_PATTERN, (rawMarker) => {
      const inputMarker = normalizedMarkers(rawMarker)[0];
      if (!inputMarker) return rawMarker;
      return canonicalMarkerByInputMarker.get(inputMarker) ?? inputMarker;
    });

  return {
    sources,
    markerMap,
    sourceIdByInputMarker,
    integrity: {
      status: unknownMarkers.length > 0 || usedAmbiguousMarkers.length > 0
        ? "blocked"
        : "pass",
      unknownMarkers,
      ambiguousMarkers: usedAmbiguousMarkers,
      rewrites,
    },
    rewriteText,
  };
}

function completeSentences(text: string): string[] {
  return reportSentences(text).filter((sentence) => sentence.length >= 12);
}

function citationMarkers(value: string): string[] {
  return Array.from(new Set(value.match(/\[S\d+\]/gu) ?? []));
}

function isEvidenceGapSentence(value: string): boolean {
  return value.includes(UNTRANSLATED_EVIDENCE_NOTICE);
}

function groupedParagraphBody(values: string[]): string {
  const result: string[] = [];
  const seen = new Set<string>();
  const gapMarkers = new Set<string>();
  let gapIndex = -1;

  for (const sentence of values.flatMap((value) => reportSentences(value))) {
    if (isEvidenceGapSentence(sentence)) {
      citationMarkers(sentence).forEach((marker) => gapMarkers.add(marker));
      if (gapIndex < 0) {
        gapIndex = result.length;
        result.push("");
      }
      continue;
    }
    if (seen.has(sentence)) continue;
    seen.add(sentence);
    result.push(sentence);
  }

  if (gapIndex >= 0) {
    result[gapIndex] = `${UNTRANSLATED_EVIDENCE_NOTICE}${Array.from(gapMarkers).join("")}\u3002`;
  }
  return result.filter(Boolean).join(" ");
}

function summarySentence(
  paragraphs: DetailedReportParagraph[],
  ids: DetailedReportParagraph["id"][],
  preferLast = false,
): string {
  const wanted = new Set(ids);
  const sentences = paragraphs
    .filter((paragraph) => wanted.has(paragraph.id))
    .flatMap((paragraph) => completeSentences(paragraph.body))
    .filter(
      (sentence) => !isEvidenceGapSentence(sentence) && /[\u3400-\u9fff]/u.test(sentence),
    );
  const citedSentences = sentences.filter((sentence) => /\[S\d+\]/u.test(sentence));
  const candidates = citedSentences.length > 0 ? citedSentences : sentences;
  if (preferLast) return candidates.at(-1) ?? "";
  return candidates[0] ?? "";
}

function buildDetailedReportParagraphsFromRegistry(
  workspace: ReportWorkspace,
  citationRegistry: DetailedReportCitationRegistry,
): DetailedReportParagraph[] {
  const seenReaderSentenceFingerprints = new Set<string>();

  return READER_SECTION_CONFIGS.flatMap((group) => {
    const sectionEntries = group.sections
      .map((configuration) => ({
        configuration,
        section: workspace.draft.sections.find(
          (section) => section.sectionId === configuration.sectionId,
        ),
      }))
      .filter((entry): entry is {
        configuration: (typeof group.sections)[number];
        section: ReportWorkspace["draft"]["sections"][number];
      } => Boolean(entry.section));
    const sections = sectionEntries.map((entry) => entry.section);
    if (sections.length === 0) return [];
    const body = citationRegistry.rewriteText(groupedParagraphBody(
      sections.map((section) => exportSafeReportSectionText(section)).filter(Boolean),
    ));
    const subsections = sectionEntries
      .map(({ configuration, section }) => ({
        sectionId: configuration.sectionId,
        title: configuration.readerTitle,
        paragraphs: readerFacingNaturalParagraphs(
          exportSafeReportSectionText(section),
          seenReaderSentenceFingerprints,
          true,
        ).map(citationRegistry.rewriteText),
      }))
      .filter((subsection) => subsection.paragraphs.length > 0);
    const citationMarkers = new Set(
      [body, ...subsections.flatMap((subsection) => subsection.paragraphs)]
        .flatMap(normalizedMarkers),
    );

    const citations = citationRegistry.sources.flatMap((source) => {
      const marker = citationRegistry.markerMap.get(source.id);
      if (!marker) return [];
      if (!citationMarkers.has(marker)) return [];
      return [{ marker, source }];
    });

    citations.sort((left, right) => {
      const leftIndex = Number(left.marker.match(/\d+/u)?.[0] ?? Number.MAX_SAFE_INTEGER);
      const rightIndex = Number(right.marker.match(/\d+/u)?.[0] ?? Number.MAX_SAFE_INTEGER);
      return leftIndex - rightIndex;
    });

    return [{
      id: group.id,
      title: group.title,
      body,
      subsections,
      citations,
      tables: [],
      figures: [],
    }];
  });
}

export interface CanonicalDetailedReportModel {
  citationRegistry: DetailedReportCitationRegistry;
  paragraphs: DetailedReportParagraph[];
  summary: string;
  formalDocument?: FormalReportDocument;
}

/**
 * Single reader-facing model shared by preview and every formal export. API
 * markers are first resolved through evidence-card identity and are then
 * rewritten once to the stable canonical registry.
 */
export function buildCanonicalDetailedReportModel(
  workspace: ReportWorkspace,
): CanonicalDetailedReportModel {
  if (!workspace.input || !workspace.generationPayload || !workspace.report) {
    const citationRegistry = buildDetailedReportCitationRegistry(workspace);
    const paragraphs = buildDetailedReportParagraphsFromRegistry(workspace, citationRegistry);
    return {
      citationRegistry,
      paragraphs,
      summary: buildDetailedReportSummary(paragraphs),
    };
  }
  const formalDocument = buildFormalReportDocument(workspace);
  const citationRegistry = buildDetailedReportCitationRegistry(workspace);
  const sourceById = new Map(
    workspace.acceptedSources.map((source) => [source.id, source] as const),
  );
  const referenceByCitationId = new Map(
    formalDocument.references.map((reference) => [reference.citationId, reference] as const),
  );
  const readerReferences = buildReaderCitationEntries(
    formalDocument.references,
    workspace.acceptedSources,
  );
  const citationsFor = (citationIds: readonly string[]): DetailedReportCitation[] => {
    const citedIds = new Set(citationIds);
    return readerReferences
      .filter((readerReference) => citedIds.has(readerReference.citationId))
      .flatMap((readerReference) => {
      const citationId = readerReference.citationId;
      const reference = referenceByCitationId.get(citationId);
      const source = reference ? sourceById.get(reference.sourceId) : null;
      return reference && readerReference && source
        ? [{
            marker: readerReference.label,
            label: readerReference.label,
            citationId,
            href: readerReference.externalHref,
            anchorId: readerReference.anchorId,
            source,
          }]
        : [];
      });
  };
  const paragraphs: DetailedReportParagraph[] = formalReportSectionSequence(formalDocument)
    .filter((section) => section.blocks.length > 0)
    .map((section) => {
      const citations = citationsFor(section.blocks.flatMap((block) => block.citationIds));
      const paragraphTexts = section.blocks.map((block) =>
        block.citationIds.length > 0
          ? stripReaderCitationTokens(block.text)
          : block.text,
      );
      const orderedContent: DetailedReportContentNode[] = formalReportSectionContent(section)
        .map((node) => {
          if (node.nodeType === "table") {
            return { nodeType: "table" as const, table: node.table };
          }
          if (node.nodeType === "figure") {
            return { nodeType: "figure" as const, figure: node.figure };
          }
          return {
            nodeType: "paragraph" as const,
            text: node.block.citationIds.length > 0
              ? stripReaderCitationTokens(node.block.text)
              : node.block.text,
            citations: citationsFor(node.block.citationIds),
            ...(node.block.segments
              ? {
                  citationSegments: node.block.segments.map((segment) => ({
                    text: stripReaderCitationTokens(segment.text),
                    citations: citationsFor(segment.citationIds),
                  })),
                }
              : {}),
            ...(node.block.paragraphRole
              ? { paragraphRole: node.block.paragraphRole }
              : {}),
          };
        });
      return {
        id: section.id,
        title: section.title,
        body: paragraphTexts.join("\n\n"),
        subsections: [{
          sectionId: section.id,
          title: section.title,
          paragraphs: paragraphTexts,
          citationGroups: section.blocks.map((block) => citationsFor(block.citationIds)),
        }],
        citations,
        tables: section.tables,
        figures: section.figures,
        orderedContent,
      };
    });
  return {
    citationRegistry,
    paragraphs,
    summary: formalDocument.abstract.text,
    formalDocument,
  };
}

export function buildDetailedReportParagraphs(
  workspace: ReportWorkspace,
): DetailedReportParagraph[] {
  return buildCanonicalDetailedReportModel(workspace).paragraphs;
}

export function buildDetailedReportSummary(
  paragraphs: DetailedReportParagraph[],
): string {
  const substantive = SUMMARY_SECTION_GROUPS
    .map((group) => summarySentence(paragraphs, group.ids, group.preferLast))
    .filter(Boolean)
    .filter((sentence, index, all) => all.indexOf(sentence) === index);
  if (substantive.length > 0) return substantive.join(" ");

  const gapParagraphs = paragraphs.filter((paragraph) =>
    completeSentences(paragraph.body).some(isEvidenceGapSentence),
  );
  if (gapParagraphs.length === 0) return "";
  const markers = Array.from(
    new Set(gapParagraphs.flatMap((paragraph) => citationMarkers(paragraph.body))),
  );
  return `${UNTRANSLATED_EVIDENCE_NOTICE}${markers.join("")}\u3002`;
}

export function applyDetailedReportSummary(
  workspace: ReportWorkspace,
  options: { force?: boolean } = {},
): ReportWorkspace {
  const canonicalModel = buildCanonicalDetailedReportModel(workspace);
  const summary = canonicalModel.summary;
  const abstractIndex = workspace.draft.sections.findIndex(
    (section) => section.sectionId === "abstract",
  );
  if (!summary || abstractIndex < 0) return workspace;

  const citationMarkers = canonicalModel.formalDocument
    ? []
    : Array.from(new Set(summary.match(/\[S\d+\]/gu) ?? []));
  const citedSourceIds = canonicalModel.formalDocument
    ? []
    : sourceIdsFromCitationMarkers(
        citationMarkers,
        canonicalModel.citationRegistry.markerMap,
      );
  const citedSourceIdSet = new Set(citedSourceIds);
  const evidenceCardIds = canonicalModel.formalDocument
    ? []
    : workspace.evidenceCards
        .filter((card) => citedSourceIdSet.has(card.sourceId))
        .map((card) => card.id);
  const sections = [...workspace.draft.sections];
  const existingAbstract = sections[abstractIndex];
  if (!existingAbstract) return workspace;
  if (existingAbstract.generationMethod === "needs_manual_review" && !options.force) {
    return workspace;
  }
  sections[abstractIndex] = {
    ...existingAbstract,
    body: summary,
    synthesizedProseZhTw: summary,
    supportingSourceIds: citedSourceIds,
    citationIds: citedSourceIds,
    citationMarkers,
    evidenceCardIds,
    evidenceSummary: summary,
    groundingStatus: canonicalModel.formalDocument
      ? canonicalModel.formalDocument.abstract.validation.status === "pass"
        ? "grounded"
        : "unsupported"
      : citationMarkers.length > 0
        ? "grounded"
        : "unsupported",
    generationMethod: "detailed_report_summary",
    citationCount: citationMarkers.length,
    evidenceCardCount: evidenceCardIds.length,
    writerNote: "摘要由完成後的詳細報告精簡而成。",
    warnings: canonicalModel.formalDocument?.abstract.validation.issues ??
      (citationMarkers.length > 0 ? [] : ["summary_has_no_citation_marker"]),
  };

  const draft = {
    ...workspace.draft,
    sections,
    text: sections
      .map((section) => `${section.title}\n${visibleReportSectionText(section)}`)
      .join("\n\n"),
  };

  return {
    ...workspace,
    draft,
    report: {
      ...workspace.report,
      meta: {
        ...workspace.report.meta,
        researchDraft: draft,
      },
    },
  };
}
