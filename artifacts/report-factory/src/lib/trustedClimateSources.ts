import {
  dedupeSourceRecords,
  normalizeSourceForReview,
  type SourceRecord,
} from "./sourceRecords.ts";
import { applySourceRelevanceAssessments } from "./sourceRelevance.ts";
import { buildTopicFacets } from "./topicFacets.ts";

const TARGET_PRIMARY_CLIMATE_SOURCES = 8;

function isClimateTopic(topic: string): boolean {
  return /氣候變遷|全球暖化|溫室氣體|climate change|global warming|greenhouse gas/i.test(topic);
}

function climateOfficialSource(source: {
  id: string;
  title: string;
  publisher: string;
  year: number;
  url: string;
  abstract: string;
  authors?: string[];
}): SourceRecord {
  return normalizeSourceForReview({
    id: `official:${source.id}`,
    title: source.title,
    authors: source.authors ?? [source.publisher],
    year: source.year,
    abstract: source.abstract,
    doi: null,
    url: source.url,
    sourceType: "Crossref",
    reviewState: "pending",
    publisher: source.publisher,
    containerTitle: source.publisher,
    accessedAt: null,
    sourceCategory: "government_or_institution",
    usableSections: ["研究背景", "文獻探討", "數據分析"],
    confidence: "高",
  });
}

function trustedClimateSources(): SourceRecord[] {
  return [
    climateOfficialSource({
      id: "ipcc-ar6-synthesis",
      title: "AR6 Synthesis Report: Climate Change 2023",
      publisher: "IPCC",
      year: 2023,
      url: "https://www.ipcc.ch/report/ar6/syr/",
      abstract:
        "The IPCC AR6 Synthesis Report assesses that human activities, principally greenhouse gas emissions, have caused global warming. It summarizes observed warming, continued greenhouse gas emissions, land-use change, fossil fuel energy use, and current climate risks.",
    }),
    climateOfficialSource({
      id: "ipcc-ar6-wg1",
      title: "Climate Change 2021: The Physical Science Basis",
      publisher: "IPCC",
      year: 2021,
      url: "https://www.ipcc.ch/report/ar6/wg1/",
      abstract:
        "The IPCC Working Group I report assesses the physical science basis of climate change, including observed warming, greenhouse gas concentrations, carbon dioxide, methane, human influence, and attribution of global temperature change.",
    }),
    climateOfficialSource({
      id: "nasa-causes",
      title: "The Causes of Climate Change",
      publisher: "NASA",
      year: 2024,
      url: "https://science.nasa.gov/climate-change/causes/",
      abstract:
        "NASA explains that recent climate change is driven mainly by human activities that increase greenhouse gases, especially carbon dioxide and methane from fossil fuel combustion, industry, land use, and deforestation.",
    }),
    climateOfficialSource({
      id: "nasa-evidence",
      title: "Evidence: How Do We Know Climate Change Is Real?",
      publisher: "NASA",
      year: 2024,
      url: "https://science.nasa.gov/climate-change/evidence/",
      abstract:
        "NASA summarizes observed climate change indicators including global temperature rise, warming oceans, shrinking ice sheets, glacial retreat, sea level rise, and atmospheric carbon dioxide concentration.",
    }),
    climateOfficialSource({
      id: "noaa-co2",
      title: "Climate Change: Atmospheric Carbon Dioxide",
      publisher: "NOAA Climate.gov",
      year: 2024,
      url: "https://www.climate.gov/news-features/understanding-climate/climate-change-atmospheric-carbon-dioxide",
      abstract:
        "NOAA Climate.gov explains the trend in atmospheric carbon dioxide concentration, the role of fossil fuel emissions and land use, and why rising CO2 is a major driver of current global warming.",
    }),
    climateOfficialSource({
      id: "noaa-temperature",
      title: "Climate Change: Global Temperature",
      publisher: "NOAA Climate.gov",
      year: 2024,
      url: "https://www.climate.gov/news-features/understanding-climate/climate-change-global-temperature",
      abstract:
        "NOAA Climate.gov summarizes observed global temperature trends, long-term warming, greenhouse gas forcing, and the current status of global surface temperature change.",
    }),
    climateOfficialSource({
      id: "wmo-state-climate-2024",
      title: "State of the Global Climate 2024",
      publisher: "World Meteorological Organization",
      year: 2025,
      url: "https://wmo.int/publication-series/state-of-global-climate-2024",
      abstract:
        "The WMO State of the Global Climate report tracks current climate indicators including global temperature, greenhouse gas concentrations, ocean heat, sea level, glacier mass, and observed climate change.",
    }),
    climateOfficialSource({
      id: "global-carbon-budget-2024",
      title: "Global Carbon Budget 2024",
      publisher: "Global Carbon Project",
      year: 2025,
      url: "https://essd.copernicus.org/articles/17/965/2025/",
      abstract:
        "The Global Carbon Budget quantifies carbon dioxide emissions from fossil fuels, industry, and land-use change, and reports atmospheric CO2 growth, emissions trends, and drivers of climate change.",
    }),
    climateOfficialSource({
      id: "noaa-aggi",
      title: "NOAA Annual Greenhouse Gas Index",
      publisher: "NOAA Global Monitoring Laboratory",
      year: 2024,
      url: "https://gml.noaa.gov/aggi/",
      abstract:
        "NOAA's Annual Greenhouse Gas Index tracks radiative forcing from long-lived greenhouse gases, including carbon dioxide, methane, nitrous oxide, and industrial gases, showing their contribution to observed warming.",
    }),
    climateOfficialSource({
      id: "epa-greenhouse-gases",
      title: "Climate Change Indicators: Greenhouse Gases",
      publisher: "U.S. Environmental Protection Agency",
      year: 2024,
      url: "https://www.epa.gov/climate-indicators/greenhouse-gases",
      abstract:
        "EPA climate indicators describe greenhouse gas emissions and atmospheric concentrations, including carbon dioxide and methane, and connect these trends to human activities and current climate change.",
    }),
  ];
}

export function supplementTrustedClimateSources(
  sources: SourceRecord[],
  topic: string,
): SourceRecord[] {
  if (!isClimateTopic(topic)) return sources;

  const facets = buildTopicFacets(topic);
  if (facets.requiredFacets.length === 0) return sources;

  const assessed = applySourceRelevanceAssessments(sources, topic);
  const primaryCount = assessed.filter((source) => source.relevanceLevel === "primary").length;
  if (primaryCount >= TARGET_PRIMARY_CLIMATE_SOURCES) return sources;

  return dedupeSourceRecords([
    ...sources,
    ...trustedClimateSources(),
  ]);
}
