import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { GeneratedReport, ReportInput } from "../src/lib/generateReport.ts";
import { buildDocxBlob } from "../src/lib/exportReport.ts";

const outputPath = resolve(process.argv[2] ?? "/tmp/researchforge-p1-evidence/canonical-zh-tw.docx");
const require = createRequire(import.meta.url);
const fontPath = require.resolve(
  "@expo-google-fonts/noto-sans-tc/400Regular/NotoSansTC_400Regular.ttf",
);

const input: ReportInput = {
  topic: "都市熱島效應與校園熱舒適度",
  reportType: "研究報告",
  academicLevel: "高中",
  targetAudience: "高中",
  researchDepth: "standard",
  purpose: "學校作業",
  domainOverride: "",
  mode: "先建立報告架構",
  sourceRequirement: "需要，並生成參考文獻格式",
  citationFormat: "APA",
  chartRequirement: "需要",
  style: "高中生自然報告風格",
  length: "一般報告",
  wordCount: "",
  formalTone: "不需要",
  conversationalTone: "不需要",
  specifiedStructure: "",
  rubric: "",
  personalStyle: "",
  supplementalMaterials: "",
  outputLanguage: "繁體中文",
  rewriteSection: "",
  additionalInfo: "",
  acceptedSources: [],
};

const report: GeneratedReport = {
  meta: {
    title: "都市熱島效應與校園熱舒適度研究報告",
    category: "自然科學",
    versionLabel: "短版研究報告",
    completeness: 82,
    suggestedAdditions: [],
    acceptedSources: [],
    bibliography: [],
    acceptedSourceCount: 3,
    usedSourceCount: 2,
    usedSourceIds: ["source-1", "source-2"],
    citedSourceIds: ["source-1", "source-2"],
    evidenceSufficiency: "short_ready",
    exportAllowed: true,
    citationIntegrity: { valid: true, errors: [] },
  },
  sections: [
    {
      heading: "摘要",
      blocks: [{
        type: "paragraph",
        text: "校園鋪面、建築密度與遮蔭配置會共同影響熱環境。本報告只整理可由來源支持的範圍，避免把背景資料寫成實驗結論[S1]。\n現有資料顯示，量測時應同時記錄氣溫、地表溫度、時段與遮蔭條件，才能比較不同場域[S2]。",
      }],
    },
    {
      heading: "研究方法",
      blocks: [
        {
          type: "list",
          items: [
            "在相同時段比較操場、走廊與樹蔭下的氣溫。",
            "記錄地表材質、遮蔭比例與風速等背景條件。",
            "保留原始量測值與照片編號，方便後續複核。",
          ],
        },
        {
          type: "note",
          text: "量測設計尚未控制所有干擾因子，因此結果只能作為校園場域的初步比較。",
        },
      ],
    },
    {
      heading: "觀測資料需求",
      blocks: [{
        type: "dataTable",
        rows: [
          {
            type: "溫度",
            need: "逐時氣溫與地表溫度",
            use: "比較不同鋪面與遮蔭場域",
            priority: "高",
          },
          {
            type: "環境條件",
            need: "風速、雲量與遮蔭比例",
            use: "說明可能的干擾因素",
            priority: "中",
          },
        ],
      }],
    },
    {
      heading: "參考資料",
      blocks: [{
        type: "paragraph",
        text: "[S1] 王小明（2024）。校園熱環境研究。https://doi.org/10.1000/heat-island\n[S2] 教育部氣候調適資料。https://example.edu.tw/climate",
      }],
    },
  ],
};

await mkdir(dirname(outputPath), { recursive: true });
const embeddedCjkFontData = new Uint8Array(await readFile(fontPath));
const blob = await buildDocxBlob(report, input, undefined, embeddedCjkFontData);
await writeFile(outputPath, Buffer.from(await blob.arrayBuffer()));
process.stdout.write(`${outputPath}\n`);
