import type { ManifestationIdentityInput } from "./studyManifestation";

export const SCHOLARLY_PAYLOAD_CLASSES = [
  "PDF_FULLTEXT",
  "PDF_SCANNED",
  "PDF_INVALID",
  "HTML_FULLTEXT",
  "HTML_ARTICLE",
  "HTML_LANDING",
  "HTML_ABSTRACT_ONLY",
  "HTML_LOGIN",
  "HTML_PAYWALL",
  "HTML_ERROR",
  "XML_JATS",
  "XML_TEI",
  "XML_OTHER",
  "JSON_METADATA",
  "TEXT",
  "BINARY_UNKNOWN",
  "NETWORK_FAILURE",
] as const;

/** Read article-owned metadata only; references and URL paths are not proof. */
export function readPayloadArticleIdentity(markup: string, format: "HTML" | "XML" | "PDF_TEXT", parsedTitle?: string): ManifestationIdentityInput {
  const identity: ManifestationIdentityInput = {};
  if (format === "HTML") {
    const head = markup.match(/<head\b[^>]*>([\s\S]*?)<\/head>/iu)?.[1] ?? "";
    const meta = new Map<string, string[]>();
    for (const tag of head.match(/<meta\b[^>]*>/giu) ?? []) {
      const attr = attributes(tag);
      const name = (attr.name ?? attr.property ?? "").toLowerCase();
      if (name && attr.content) meta.set(name, [...(meta.get(name) ?? []), attr.content]);
    }
    const first = (...keys: string[]) => keys.flatMap(key => meta.get(key) ?? [])[0];
    identity.title = first("citation_title", "dc.title", "og:title");
    identity.doi = first("citation_doi", "dc.identifier.doi", "prism.doi");
    const dois = [...new Set(["citation_doi", "dc.identifier.doi", "prism.doi"].flatMap(key => meta.get(key) ?? []).map(value => value.toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//u, "").replace(/^doi:\s*/u, "")))];
    if (dois.length > 1) identity.conflictingIdentifiers = dois;
    // The first article-owned heading must not contradict head metadata. Do
    // not inspect reference titles or use page chrome as article authority.
    const articleBody = markup.match(/<article\b[^>]*>([\s\S]*?)<\/article>/iu)?.[1];
    const articleTitle = articleBody?.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1];
    const normalizedTitle = (value: string) => clean(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (identity.title && articleTitle && normalizedTitle(identity.title) !== normalizedTitle(articleTitle)) {
      identity.conflictingIdentifiers = [...(identity.conflictingIdentifiers ?? []), "ARTICLE_HEADER_TITLE_CONFLICT"];
    }
    identity.pmid = first("citation_pmid");
    identity.pmcid = first("citation_pmcid");
    identity.arxivId = first("citation_arxiv_id");
    identity.authors = meta.get("citation_author") ?? meta.get("dc.creator");
    identity.year = Number(first("citation_publication_date", "citation_date", "dc.date")?.match(/\b(?:19|20)\d{2}\b/u)?.[0]) || undefined;
    identity.venue = first("citation_journal_title", "prism.publicationname");
  } else if (format === "XML") {
    const front = firstBlock(markup, ["front", "teiHeader"]) || markup.split(/<(?:\w+:)?body\b/iu, 1)[0]!;
    const article = firstBlock(front, ["article-meta"]) || front;
    const id = (name: string) => clean(article.match(new RegExp(`<(?:\\w+:)?(?:article-id|idno)\\b[^>]*(?:pub-id-type|type)=["']${name}["'][^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?(?:article-id|idno)>`, "iu"))?.[1]);
    identity.doi = id("doi") || clean(firstBlock(front, ["doi", "identifier"]));
    const documentDois = [...new Set([...article.matchAll(/<(?:\w+:)?(?:article-id|idno)\b[^>]*(?:pub-id-type|type)=["']doi["'][^>]*>([\s\S]*?)<\/(?:\w+:)?(?:article-id|idno)>/giu)].map(match => clean(match[1]).toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//u, "")))];
    if (documentDois.length > 1) identity.conflictingIdentifiers = documentDois;
    identity.pmid = id("pmid");
    identity.pmcid = id("pmcid");
    identity.arxivId = id("arxiv");
    identity.title = clean(firstBlock(article, ["article-title"]) || firstBlock(firstBlock(article, ["titleStmt"]) || article, ["title"]));
    identity.authors = blocks(article, "contrib").filter(block => !/contrib-type=["'](?:editor|translator)["']/iu.test(block)).map(block => clean(firstBlock(block, ["name", "string-name"]))).filter(Boolean);
    identity.year = Number(clean(firstBlock(firstBlock(article, ["pub-date"]), ["year"]))) || undefined;
    identity.venue = clean(firstBlock(front, ["journal-title"]));
  } else {
    // A DOI in the bibliography or running body is not the article DOI. Only
    // explicit front-matter DOI labels or a leading DOI token are considered.
    const front = markup.split(/\b(?:abstract|introduction|references|bibliography)\b/iu, 1)[0]!.slice(0, 4_000);
    const doi = front.match(/(?:^\s*|\bdoi\s*:\s*|https?:\/\/(?:dx\.)?doi\.org\/)(10\.\d{4,9}\/[^\s<>"']+)/iu)?.[1];
    identity.doi = doi?.replace(/[.,;]+$/u, "");
    identity.title = parsedTitle;
    identity.authors = front.match(/(?:^|\n)Authors?\s*:\s*([^\n]+)/iu)?.[1]?.split(/\s*;\s*/u);
    identity.year = Number(front.match(/(?:^|\n)(?:Publication year|Year)\s*:\s*((?:19|20)\d{2})/iu)?.[1]) || undefined;
    identity.pmcid = front.match(/\bPMCID\s*:\s*(PMC\d+)\b/iu)?.[1];
    identity.pmid = front.match(/\bPMID\s*:\s*(\d+)\b/iu)?.[1];
    identity.arxivId = front.match(/\barXiv\s*:\s*([\d.]+(?:v\d+)?)\b/iu)?.[1];
  }
  return identity;
}

export type ScholarlyPayloadClass = (typeof SCHOLARLY_PAYLOAD_CLASSES)[number];

export type ScholarlyPayloadFormat =
  | "PDF"
  | "HTML"
  | "JATS_XML"
  | "TEI_XML"
  | "XML"
  | "JSON"
  | "TEXT"
  | "BINARY";

export interface ScholarlyPayloadDetection {
  declaredMime: string;
  detectedMime: string;
  format: ScholarlyPayloadFormat;
  payloadClass: ScholarlyPayloadClass;
  detectionMethod: string[];
  mismatch: boolean;
  charset?: string;
  magicBytes: string;
}

export interface LandingArtifactLink {
  url: string;
  signal: string;
  formatHint: "PDF" | "HTML" | "XML" | "UNKNOWN";
  confidence: "HIGH" | "MEDIUM";
}

export interface ScholarlyHtmlInspection {
  payloadClass:
    | "HTML_FULLTEXT"
    | "HTML_ARTICLE"
    | "HTML_LANDING"
    | "HTML_ABSTRACT_ONLY"
    | "HTML_LOGIN"
    | "HTML_PAYWALL"
    | "HTML_ERROR";
  title?: string;
  doi?: string;
  pmcid?: string;
  arxivId?: string;
  paragraphCount: number;
  headingCount: number;
  bodyCharacterCount: number;
  fullTextSignals: string[];
  shellSignals: string[];
  directArtifactLinks: LandingArtifactLink[];
}

export interface StructuredXmlMaterialization {
  format: "JATS_XML" | "TEI_XML" | "XML";
  title: string;
  abstract: string;
  doi: string;
  sections: Array<{ heading: string; text: string }>;
  references: string[];
  captions: string[];
  text: string;
}

const decoder = new TextDecoder("utf-8", { fatal: false });

function clean(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&#x([0-9a-f]+);/giu, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/gu, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/\s+/gu, " ")
    .trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function declaredMime(value: string | null | undefined): string {
  return (value ?? "").split(";", 1)[0]?.trim().toLocaleLowerCase() ?? "";
}

function mimeFamily(value: string): string {
  if (/pdf/iu.test(value)) return "PDF";
  if (/html|xhtml/iu.test(value)) return "HTML";
  if (/jats|xml|tei/iu.test(value)) return "XML";
  if (/json/iu.test(value)) return "JSON";
  if (/^text\//iu.test(value)) return "TEXT";
  if (!value || /octet-stream/iu.test(value)) return "UNKNOWN";
  return value;
}

function printableRatio(bytes: Uint8Array): number {
  if (bytes.byteLength === 0) return 0;
  const sample = bytes.slice(0, Math.min(bytes.byteLength, 16_384));
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte !== 127)) printable += 1;
  }
  return printable / sample.byteLength;
}

function magicBytes(bytes: Uint8Array): string {
  return [...bytes.slice(0, 12)].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

export function sniffScholarlyPayload(input: {
  bytes: Uint8Array;
  declaredContentType?: string | null;
  url?: string | null;
}): ScholarlyPayloadDetection {
  const declared = declaredMime(input.declaredContentType);
  const prefixBytes = input.bytes.slice(0, Math.min(input.bytes.byteLength, 65_536));
  const prefix = decoder.decode(prefixBytes).replace(/^\uFEFF/u, "").trimStart();
  const methods: string[] = [];
  let detected = "application/octet-stream";
  let format: ScholarlyPayloadFormat = "BINARY";
  let payloadClass: ScholarlyPayloadClass = "BINARY_UNKNOWN";

  if (input.bytes.byteLength >= 5 && decoder.decode(input.bytes.slice(0, 5)) === "%PDF-") {
    detected = "application/pdf";
    format = "PDF";
    const trailer = decoder.decode(input.bytes.slice(Math.max(0, input.bytes.byteLength - 2_048)));
    const plausiblyTruncated = input.bytes.byteLength >= 2_048 && !/%%EOF\s*$/u.test(trailer.trimEnd());
    payloadClass = plausiblyTruncated ? "PDF_INVALID" : "PDF_FULLTEXT";
    methods.push("PDF_MAGIC_%PDF-");
    if (plausiblyTruncated) methods.push("PDF_EOF_MISSING_TRUNCATED_PAYLOAD");
  } else if (/^<!doctype\s+html\b|^<html\b|^<head\b|^<body\b/iu.test(prefix)) {
    detected = "text/html";
    format = "HTML";
    payloadClass = "HTML_LANDING";
    methods.push("HTML_DOCUMENT_ROOT");
  } else if (/^<\?xml\b/iu.test(prefix) || /^<(?:article|tei)(?:\s|>)/iu.test(prefix)) {
    if (/<(?:\w+:)?TEI(?:\s|>)|xmlns(?::\w+)?=["'][^"']*tei-c\.org\/ns\/1\.0/iu.test(prefix)) {
      detected = "application/tei+xml";
      format = "TEI_XML";
      payloadClass = "XML_TEI";
      methods.push("TEI_ROOT_OR_NAMESPACE");
    } else if (/<article(?:\s|>)|xmlns(?::\w+)?=["'][^"']*(?:jats|nlm\.nih\.gov)/iu.test(prefix)) {
      detected = "application/jats+xml";
      format = "JATS_XML";
      payloadClass = "XML_JATS";
      methods.push("JATS_ARTICLE_ROOT_OR_NAMESPACE");
    } else {
      detected = "application/xml";
      format = "XML";
      payloadClass = "XML_OTHER";
      methods.push("XML_DECLARATION_OR_ROOT");
    }
  } else if (/^[\[{]/u.test(prefix)) {
    try {
      JSON.parse(decoder.decode(input.bytes));
      detected = "application/json";
      format = "JSON";
      payloadClass = "JSON_METADATA";
      methods.push("JSON_PARSE_SUCCESS");
    } catch {
      if (printableRatio(input.bytes) >= 0.88) {
        detected = "text/plain";
        format = "TEXT";
        payloadClass = "TEXT";
        methods.push("UTF8_TEXTUAL_PAYLOAD");
      }
    }
  } else if (printableRatio(input.bytes) >= 0.88) {
    detected = "text/plain";
    format = "TEXT";
    payloadClass = "TEXT";
    methods.push("UTF8_TEXTUAL_PAYLOAD");
  }

  if (methods.length === 0) methods.push("BINARY_SIGNATURE_UNKNOWN");
  const declaredFamily = mimeFamily(declared);
  const detectedFamily = mimeFamily(detected);
  return {
    declaredMime: declared || "unknown",
    detectedMime: detected,
    format,
    payloadClass,
    detectionMethod: methods,
    mismatch: declaredFamily !== "UNKNOWN" && declaredFamily !== detectedFamily,
    ...((input.declaredContentType ?? "").match(/charset\s*=\s*([^;\s]+)/iu)?.[1]
      ? { charset: (input.declaredContentType ?? "").match(/charset\s*=\s*([^;\s]+)/iu)![1]!.toLocaleLowerCase() }
      : {}),
    magicBytes: magicBytes(input.bytes),
  };
}

function attributes(markup: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const match of markup.matchAll(/([:\w-]+)\s*=\s*(?:["']([^"']*)["']|([^\s>]+))/giu)) {
    const key = match[1]?.toLocaleLowerCase();
    const value = clean(match[2] ?? match[3]);
    if (key && value) output[key] = value;
  }
  return output;
}

export function resolveCandidateUrl(baseUrl: string, candidateHref: string | null | undefined): string | null {
  const value = clean(candidateHref);
  if (!value || /^javascript:|^data:|^file:/iu.test(value)) return null;
  try {
    const resolved = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(resolved.protocol)) return null;
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

function formatHint(value: string): LandingArtifactLink["formatHint"] {
  if (/pdf/iu.test(value)) return "PDF";
  if (/xml|jats|tei/iu.test(value)) return "XML";
  if (/html|full.?text|article/iu.test(value)) return "HTML";
  return "UNKNOWN";
}

export function discoverLandingArtifactLinks(html: string, baseUrl: string): LandingArtifactLink[] {
  const links: LandingArtifactLink[] = [];
  const baseTag = html.match(/<base\b[^>]*>/iu)?.[0];
  const declaredBase = baseTag ? attributes(baseTag).href : undefined;
  const documentBase = resolveCandidateUrl(baseUrl, declaredBase) ?? baseUrl;
  const add = (value: string | undefined, signal: string, hintText: string, confidence: LandingArtifactLink["confidence"]) => {
    const url = resolveCandidateUrl(documentBase, value);
    if (!url) return;
    links.push({ url, signal, formatHint: formatHint(`${hintText} ${url}`), confidence });
  };

  for (const tag of html.match(/<meta\b[^>]*>/giu) ?? []) {
    const attrs = attributes(tag);
    const name = clean(attrs.name || attrs.property).toLocaleLowerCase();
    if (["citation_pdf_url", "citation_fulltext_html_url", "citation_public_url", "eprints.document_url"].includes(name)) {
      add(attrs.content, `META_${name.toLocaleUpperCase()}`, name, "HIGH");
    } else if (["dc.identifier", "dc.relation"].includes(name) && /(?:https?:|\/|\.pdf|\.xml|full.?text)/iu.test(clean(attrs.content))) {
      add(attrs.content, "META_DC_IDENTIFIER_URL", name, "MEDIUM");
    }
  }
  for (const tag of html.match(/<link\b[^>]*>/giu) ?? []) {
    const attrs = attributes(tag);
    const descriptor = `${attrs.rel ?? ""} ${attrs.type ?? ""}`;
    if (/alternate|canonical|full.?text|pdf|jats|tei|xml/iu.test(descriptor) &&
      (!/canonical/iu.test(descriptor) || /pdf|jats|tei|xml|full.?text/iu.test(`${attrs.type ?? ""} ${attrs.href ?? ""}`))) {
      add(attrs.href, "LINK_ALTERNATE_ARTIFACT", descriptor, /pdf|jats|tei/iu.test(descriptor) ? "HIGH" : "MEDIUM");
    }
  }
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)) {
    const attrs = attributes(match[1] ?? "");
    const label = clean(match[2]);
    if (/\.pdf(?:[?#]|$)/iu.test(attrs.href ?? "") || /download\s+pdf|view\s+pdf|full\s*text|read\s+article|xml|jats|tei/iu.test(label)) {
      add(attrs.href, "ANCHOR_DIRECT_ARTIFACT", label, /pdf|\.pdf/iu.test(`${label} ${attrs.href ?? ""}`) ? "HIGH" : "MEDIUM");
    }
  }
  for (const tag of html.match(/<(?:object|embed|iframe)\b[^>]*>/giu) ?? []) {
    const attrs = attributes(tag);
    add(attrs.data || attrs.src, "EMBEDDED_DOCUMENT", `${attrs.type ?? ""} ${attrs.data ?? attrs.src ?? ""}`, "MEDIUM");
  }
  for (const match of html.matchAll(/<script\b[^>]*(?:type=["']application\/ld\+json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/giu)) {
    try {
      const payload = JSON.parse(match[1] ?? "") as unknown;
      const visit = (value: unknown, path: string[] = []) => {
        if (Array.isArray(value)) {
          value.slice(0, 50).forEach((item, index) => visit(item, [...path, String(index)]));
          return;
        }
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          const nextPath = [...path, key];
          if (typeof child === "string" && /encoding|associatedMedia|contentUrl|downloadUrl|full.?text|pdf|xml|jats|tei|bitstream/iu.test(nextPath.join("."))) {
            add(child, /__NEXT_DATA__/iu.test(match[0]) ? "NEXT_DATA_PUBLIC_ARTIFACT" : "JSONLD_PUBLIC_ARTIFACT", nextPath.join("."), "MEDIUM");
          } else if (nextPath.length < 8) {
            visit(child, nextPath);
          }
        }
      };
      visit(payload);
    } catch {
      // Malformed hydration metadata is not itself evidence of a full-text endpoint.
    }
  }
  for (const tag of html.match(/<link\b[^>]*>/giu) ?? []) {
    const attrs = attributes(tag);
    if (/preload/iu.test(attrs.rel ?? "") && /pdf|xml|jats|tei|article|full.?text/iu.test(`${attrs.as ?? ""} ${attrs.type ?? ""} ${attrs.href ?? ""}`)) {
      add(attrs.href, "PUBLIC_PRELOADED_ARTIFACT", `${attrs.as ?? ""} ${attrs.type ?? ""}`, "MEDIUM");
    }
  }
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = link.url.replace(/#.*$/u, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

function metaContent(html: string, names: string[]): string {
  for (const tag of html.match(/<meta\b[^>]*>/giu) ?? []) {
    const attrs = attributes(tag);
    const name = clean(attrs.name || attrs.property).toLocaleLowerCase();
    if (names.includes(name) && clean(attrs.content)) return clean(attrs.content);
  }
  return "";
}

export function inspectScholarlyHtml(html: string, baseUrl: string): ScholarlyHtmlInspection {
  const title = clean(
    metaContent(html, ["citation_title", "dc.title", "og:title"]) ||
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1],
  );
  const doi = clean(metaContent(html, ["citation_doi", "dc.identifier"]))
    .replace(/^doi:\s*/iu, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "") || undefined;
  const pmcid = clean(html.match(/\bPMC\d+\b/iu)?.[0]).toLocaleUpperCase() || undefined;
  const arxivId = clean(html.match(/arxiv\.org\/(?:abs|pdf|html)\/([^/?#]+?)(?:\.pdf)?(?:[?#]|$)/iu)?.[1]) || undefined;
  const withoutChrome = html
    .replace(/<!--?[\s\S]*?-->/gu, " ")
    .replace(/<(script|style|noscript|svg|canvas|nav|footer|header|aside|form)\b[^>]*>[\s\S]*?<\/\1>/giu, " ");
  const paragraphs = [...withoutChrome.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)]
    .map((match) => clean(match[1]))
    .filter((value) => value.length >= 40);
  const headings = [...withoutChrome.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/giu)]
    .map((match) => clean(match[1]))
    .filter(Boolean);
  const bodyText = clean(withoutChrome);
  const lower = bodyText.toLocaleLowerCase();
  const rawLower = html.toLocaleLowerCase();
  const fullTextSignals = unique([
    /<article\b/iu.test(withoutChrome) ? "ARTICLE_ELEMENT" : "",
    /<main\b/iu.test(withoutChrome) ? "MAIN_ELEMENT" : "",
    /["']@type["']\s*:\s*["']ScholarlyArticle["']/iu.test(html) ? "JSONLD_SCHOLARLY_ARTICLE" : "",
    metaContent(html, ["citation_title"]) ? "CITATION_TITLE" : "",
    metaContent(html, ["citation_doi"]) ? "CITATION_DOI" : "",
    headings.some((heading) => /introduction|background/iu.test(heading)) ? "INTRODUCTION_HEADING" : "",
    headings.some((heading) => /methods?|materials?|methodology/iu.test(heading)) ? "METHODS_HEADING" : "",
    headings.some((heading) => /results?|findings?/iu.test(heading)) ? "RESULTS_HEADING" : "",
    headings.some((heading) => /discussion|conclusions?/iu.test(heading)) ? "DISCUSSION_HEADING" : "",
    headings.some((heading) => /references?|bibliography/iu.test(heading)) ? "REFERENCES_HEADING" : "",
    paragraphs.length >= 8 ? "SUBSTANTIVE_PARAGRAPH_COUNT" : "",
    bodyText.length >= 4_000 ? "HIGH_TEXT_EXTENT" : "",
  ].filter(Boolean));
  const shellSignals = unique([
    /captcha|cf-chl-|verify you are human|attention required|enable javascript and cookies/iu.test(html) ? "BOT_CHALLENGE" : "",
    /sign in to (?:continue|access)|login required|institutional access/iu.test(rawLower) ? "LOGIN_REQUIRED" : "",
    /purchase (?:article|access)|subscribe to access|rent this article|pay per view/iu.test(rawLower) ? "PAYWALL" : "",
    /404 not found|500 internal server error|service unavailable|temporarily unavailable/iu.test(rawLower) ? "ERROR_PAGE" : "",
    /\babstract\b/iu.test(headings.join(" ")) || Boolean(metaContent(html, ["citation_abstract", "dc.description"])) ? "ABSTRACT_PRESENT" : "",
    /download citation|endnote|refworks|online issn|print issn/iu.test(lower) ? "PUBLISHER_METADATA_SHELL" : "",
  ].filter(Boolean));
  const scholarlyMetadata = ["CITATION_TITLE", "CITATION_DOI", "JSONLD_SCHOLARLY_ARTICLE"]
    .filter((signal) => fullTextSignals.includes(signal)).length;
  const structuralHeadings = fullTextSignals.filter((signal) => /HEADING$/u.test(signal)).length;
  const articleContainer = fullTextSignals.includes("ARTICLE_ELEMENT") || fullTextSignals.includes("MAIN_ELEMENT");
  const directArtifactLinks = discoverLandingArtifactLinks(html, baseUrl);
  let payloadClass: ScholarlyHtmlInspection["payloadClass"] = "HTML_LANDING";
  if (shellSignals.includes("BOT_CHALLENGE") || shellSignals.includes("LOGIN_REQUIRED")) payloadClass = "HTML_LOGIN";
  else if (shellSignals.includes("PAYWALL")) payloadClass = "HTML_PAYWALL";
  else if (shellSignals.includes("ERROR_PAGE")) payloadClass = "HTML_ERROR";
  else if (
    (articleContainer && paragraphs.length >= 5 && bodyText.length >= 1_200 && (scholarlyMetadata >= 1 || headings.length >= 2)) ||
    (structuralHeadings >= 3 && paragraphs.length >= 3 && bodyText.length >= 1_200) ||
    (paragraphs.length >= 8 && bodyText.length >= 3_000 && scholarlyMetadata >= 1 && headings.length >= 2) ||
    (paragraphs.length >= 12 && bodyText.length >= 4_000 && scholarlyMetadata >= 1)
  ) payloadClass = structuralHeadings >= 2 ? "HTML_FULLTEXT" : "HTML_ARTICLE";
  else if (shellSignals.includes("ABSTRACT_PRESENT") && paragraphs.length <= 4 && bodyText.length < 3_000) payloadClass = "HTML_ABSTRACT_ONLY";
  return {
    payloadClass,
    ...(title ? { title } : {}),
    ...(doi ? { doi } : {}),
    ...(pmcid ? { pmcid } : {}),
    ...(arxivId ? { arxivId } : {}),
    paragraphCount: paragraphs.length,
    headingCount: headings.length,
    bodyCharacterCount: bodyText.length,
    fullTextSignals,
    shellSignals,
    directArtifactLinks,
  };
}

function blocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "giu");
  return [...xml.matchAll(pattern)].map((match) => match[1] ?? "");
}

function firstBlock(xml: string, tags: string[]): string {
  for (const tag of tags) {
    const value = blocks(xml, tag)[0];
    if (value) return value;
  }
  return "";
}

function sectionText(block: string): string {
  const paragraphs = [
    ...blocks(block, "p"),
    ...blocks(block, "caption"),
    ...blocks(block, "figDesc"),
  ].map(clean).filter(Boolean);
  return clean(paragraphs.join(" ") || block);
}

export function materializeStructuredXml(xml: string): StructuredXmlMaterialization {
  const prefix = xml.slice(0, 65_536);
  const tei = /<(?:\w+:)?TEI(?:\s|>)|tei-c\.org\/ns\/1\.0/iu.test(prefix);
  const jats = !tei && (/<article(?:\s|>)|(?:jats|nlm\.nih\.gov)/iu.test(prefix));
  const format: StructuredXmlMaterialization["format"] = tei ? "TEI_XML" : jats ? "JATS_XML" : "XML";
  const title = clean(tei
    ? firstBlock(firstBlock(xml, ["titleStmt"]) || xml, ["title"])
    : firstBlock(xml, ["article-title", "title"]));
  const abstract = clean(firstBlock(xml, ["abstract"]));
  const doiBlock = tei
    ? (xml.match(/<(?:\w+:)?idno\b[^>]*type=["']DOI["'][^>]*>([\s\S]*?)<\/(?:\w+:)?idno>/iu)?.[1] ?? "")
    : jats
      ? (xml.match(/<(?:\w+:)?article-id\b[^>]*pub-id-type=["']doi["'][^>]*>([\s\S]*?)<\/(?:\w+:)?article-id>/iu)?.[1] ?? "")
      : firstBlock(xml, ["doi"]);
  const body = firstBlock(xml, ["body"]);
  const sectionBlocks = tei
    ? blocks(body, "div")
    : jats
      ? blocks(body, "sec")
      : [...blocks(body, "section"), ...blocks(body, "sec")];
  const sections = sectionBlocks.map((block) => ({
    heading: clean(firstBlock(block, tei ? ["head"] : ["title", "heading", "head"])) || "Article body",
    text: sectionText(block),
  })).filter((section) => section.text.length >= 80);
  if (sections.length === 0 && clean(body).length >= 80) {
    sections.push({ heading: "Article body", text: sectionText(body) });
  }
  const references = (tei ? blocks(xml, "biblStruct") : blocks(firstBlock(xml, ["ref-list"]) || xml, "ref"))
    .map(clean).filter(Boolean);
  const captions = [
    ...blocks(xml, "caption"),
    ...blocks(xml, "figDesc"),
  ].map(clean).filter(Boolean);
  return {
    format,
    title,
    abstract,
    doi: clean(doiBlock).replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, ""),
    sections,
    references,
    captions,
    text: clean([
      ...sections.map((section) => `${section.heading}\n${section.text}`),
      references.length ? `References\n${references.join(" ")}` : "",
      captions.length ? `Captions\n${captions.join(" ")}` : "",
    ].filter(Boolean).join("\n\n")),
  };
}
