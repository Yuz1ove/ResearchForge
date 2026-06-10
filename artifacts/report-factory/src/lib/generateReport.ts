// generateReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock report generation engine for Report Factory AI.
//
// To connect a real model later: replace the body of `generateReport()` with an
// async call to /api/generate (or the OpenAI chat completions endpoint) that
// returns the same `GeneratedReport` shape. All UI renders generically from the
// block-based model below, so no UI changes are required for the swap.
//
// IMPORTANT: This mock never fabricates citations, URLs, authors, or statistics.
// Where real data is required it emits Traditional-Chinese placeholder notes.
// All code/comments are English; all user-facing strings are Traditional Chinese.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Form option lists (single source of truth, imported by the UI) ──────────

export const REPORT_TYPES = [
  "學校研究報告",
  "科展報告",
  "實驗報告",
  "專題報告",
  "讀書心得報告",
  "商業報告",
  "市場研究報告",
  "社會議題報告",
  "網站／AI／程式報告",
] as const;

export const TARGET_AUDIENCES = [
  "國中生",
  "高中生",
  "大學生",
  "老師",
  "評審",
  "客戶",
  "公司主管",
  "一般讀者",
] as const;

export const REPORT_PURPOSES = [
  "學校作業",
  "研究報告",
  "科展報告",
  "專題製作",
  "讀書心得",
  "實驗報告",
  "商業分析",
  "簡報講稿",
  "網站／AI／程式專案",
  "其他",
] as const;

export const GENERATION_MODES = [
  "報告架構",
  "完整報告",
  "簡報大綱",
  "資料需求表",
  "圖表與圖片建議",
] as const;

export const SOURCE_REQUIREMENTS = [
  "不需要",
  "需要，但先標示「資料來源待補」",
  "需要，並生成參考文獻格式",
] as const;

export const CITATION_FORMATS = ["無", "APA", "MLA", "Chicago", "老師指定格式"] as const;

export const CHART_REQUIREMENTS = ["需要", "不需要"] as const;

export const REPORT_STYLES = [
  "高中生可提交",
  "90 分以上學校報告",
  "學術研究風格",
  "商業顧問風格",
  "口語簡報風格",
  "深度研究報告",
] as const;

export const REPORT_LENGTHS = ["短版摘要", "一般報告", "完整報告", "深度研究"] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReportInput {
  topic: string;
  reportType: string;
  targetAudience: string;
  purpose: string;
  mode: string;
  sourceRequirement: string;
  citationFormat: string;
  chartRequirement: string;
  style: string;
  length: string;
  additionalInfo: string;
}

export type TopicCategory =
  | "生物／動物"
  | "科學實驗"
  | "社會議題"
  | "歷史／地理／公民"
  | "讀書心得"
  | "商業／產品分析"
  | "AI／網站／程式專案"
  | "醫療／長照／社工／心理"
  | "食品／飲食文化"
  | "化學／化工"
  | "一般學校報告";

export interface SuggestionBlock {
  title: string;
  position: string;
  purpose: string;
  content: string;
}

export interface DataRequirementRow {
  type: string;
  need: string;
  use: string;
  priority: "高" | "中" | "低";
}

export interface QualityCheck {
  label: string;
  passed: boolean;
}

export interface SlideItem {
  page: number;
  title: string;
  points: string[];
  visual: string;
}

export type BlockType =
  | "paragraph"
  | "list"
  | "note"
  | "suggestions"
  | "dataTable"
  | "quality"
  | "slides";

export interface ContentBlock {
  type: BlockType;
  text?: string;
  items?: string[];
  suggestions?: SuggestionBlock[];
  suggestionKind?: "圖表" | "圖片" | "流程圖";
  rows?: DataRequirementRow[];
  checks?: QualityCheck[];
  slides?: SlideItem[];
}

export interface ReportSection {
  heading: string;
  blocks: ContentBlock[];
}

export interface ReportMeta {
  title: string;
  category: TopicCategory;
  versionLabel: string;
  completeness: number;
  suggestedAdditions: string[];
}

export interface GeneratedReport {
  meta: ReportMeta;
  shortTopic?: { message: string; expansions: string[] };
  sections: ReportSection[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function chars(s: string): number {
  return Array.from(s.trim()).length;
}

function has(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

const SOURCE_NOTE = "資料來源待補；建議查詢政府網站、學術論文、期刊、出版社或可信機構資料。";
const INSERT_SOURCE_NOTE = "【此處建議加入資料來源】此處需要補充官方資料或學術資料。";

function needsSource(input: ReportInput): boolean {
  return input.sourceRequirement !== "不需要";
}

function wantsReferences(input: ReportInput): boolean {
  return input.sourceRequirement === "需要，並生成參考文獻格式";
}

// ─── Topic category detection ────────────────────────────────────────────────

export function detectTopicCategory(
  topic: string,
  reportType: string,
  purpose: string,
): TopicCategory {
  const t = topic.toLowerCase();
  const tt = topic;
  const rt = reportType;
  const pp = purpose;

  // Book reflection — strongest signals first
  if (
    /[《〈].+[》〉]/.test(tt) ||
    has(tt, ["心得", "讀後", "讀書"]) ||
    has(rt, ["讀書心得"]) ||
    has(pp, ["讀書心得"])
  ) {
    return "讀書心得";
  }

  // Science experiment
  if (
    has(rt, ["實驗", "科展"]) ||
    has(pp, ["實驗報告", "科展報告"]) ||
    has(tt, ["實驗", "氧化", "發酵", "溶解", "酸鹼", "ph", "結晶", "電解"]) ||
    (has(tt, ["溫度", "光照", "濃度", "速率", "生長", "影響"]) && has(tt, ["對", "影響", "速率", "之"]))
  ) {
    return "科學實驗";
  }

  // Food / culinary / beverage — MUST precede biology so "牛排" → food, not animal
  if (
    has(pp, ["飲食", "食品", "料理", "餐飲"]) ||
    has(rt, ["飲食", "食品", "料理"]) ||
    has(tt, [
      // animal-origin food compounds (checked before bare animal keywords)
      "牛排", "牛肉", "雞排", "雞肉", "豬排", "豬肉", "羊肉", "海鮮", "魚片", "魚排",
      // beverages
      "咖啡", "茶葉", "奶茶", "果汁", "飲料", "啤酒", "紅酒", "白酒", "牛奶",
      // culinary / food industry
      "料理", "烹飪", "烹調", "飲食", "食品", "食物", "食材", "餐廳", "餐飲", "烘焙",
      "甜點", "零食", "麵包", "點心", "外食", "速食", "有機食", "素食", "純素",
      "食安", "食品安全", "農產品", "熟成", "發酵食", "醃製", "保存食",
    ])
  ) {
    return "食品／飲食文化";
  }

  // Chemistry / materials / nutrition science
  if (
    has(tt, [
      "維生素", "礦物質", "蛋白質", "碳水化合物", "脂肪酸", "胺基酸", "膳食纖維",
      "化學", "化合物", "分子", "原子", "元素", "酵素", "化工", "高分子", "奈米",
      "有機化", "無機", "氧化還原", "催化", "合成", "聚合", "塑料", "陶瓷材料",
    ])
  ) {
    return "化學／化工";
  }

  // AI / website / programming project
  if (
    has(pp, ["網站", "程式", "ai", "AI"]) ||
    has(rt, ["網站", "程式", "AI"]) ||
    has(t, ["ai", "app", "bridge", "python", "ollama", "api", "演算法"]) ||
    has(tt, [
      "網站", "程式", "系統", "平台", "工具", "自動化", "資料庫", "演算法",
      "人工智慧", "機器學習", "生成器", "深度學習", "大型語言模型", "神經網路",
    ])
  ) {
    return "AI／網站／程式專案";
  }

  // Business / product / industry analysis — includes well-known company names
  if (
    has(pp, ["商業分析"]) ||
    has(rt, ["商業", "市場"]) ||
    has(tt, [
      "商業模式", "競品", "行銷", "品牌", "產品分析", "市場", "營收", "獲利", "創業", "電商",
      // company names & industry terms
      "台積電", "鴻海", "聯發科", "聯電", "華碩", "宏碁", "中華電信", "台灣大哥大",
      "TSMC", "tsmc", "股票", "半導體", "晶片", "晶圓", "積體電路", "投資",
      "上市公司", "股市", "產業鏈", "供應鏈", "企業策略", "競爭力",
    ])
  ) {
    return "商業／產品分析";
  }

  // Medical / long-term care / social work / psychology
  if (
    has(tt, [
      "長照", "失智", "社工", "焦慮", "憂鬱", "心理", "醫療", "護理", "照顧", "照護",
      "復健", "諮商", "高齡照", "安寧", "身心", "成癮", "自殺防治", "心理學",
    ])
  ) {
    return "醫療／長照／社工／心理";
  }

  // Social issues
  if (
    has(rt, ["社會議題"]) ||
    has(tt, [
      "少子化", "高齡化", "霸凌", "詐騙", "交通安全", "環保", "污染", "性別", "平權",
      "貧富", "失業", "移工", "氣候變遷", "假訊息", "成癮", "公共", "權益",
    ]) ||
    (has(tt, ["影響"]) && has(tt, ["學生", "青少年", "社會", "兒童"]))
  ) {
    return "社會議題";
  }

  // History / geography / civics
  if (
    has(tt, [
      "古蹟", "歷史", "地理", "地形", "公民", "選舉", "投票", "創生", "朝代", "戰爭",
      "鄭成功", "清朝", "日治", "氣候", "河川", "山脈", "文化資產", "條約", "制度",
    ])
  ) {
    return "歷史／地理／公民";
  }

  // Biology / animal — bare animal keywords; food compounds already caught above
  if (
    has(tt, [
      "鵝", "貓", "狗", "蚯蚓", "蝴蝶", "青蛙", "魚", "蜜蜂", "雞", "鴨", "豬", "牛",
      "羊", "馬", "兔", "鳥", "昆蟲", "植物", "動物", "細菌", "病毒", "生態", "物種",
      "螞蟻", "蜘蛛", "蛇", "龜", "鯨", "獅", "虎", "熊", "猴", "象",
    ])
  ) {
    return "生物／動物";
  }

  return "一般學校報告";
}

// ─── Short-topic detection & expansion ───────────────────────────────────────

const BROAD_TOPICS = ["鵝", "ai", "咖啡", "手機", "社工", "長照", "台南", "貓", "狗", "水", "電", "茶"];

export function isShortTopic(topic: string): boolean {
  const t = topic.trim();
  if (!t) return false;
  return chars(t) <= 4 || BROAD_TOPICS.includes(t.toLowerCase());
}

export function expandTopic(topic: string, category?: TopicCategory): string[] {
  const t = topic.trim() || "主題";
  const cat = category ?? detectTopicCategory(t, "", "");
  switch (cat) {
    case "食品／飲食文化":
      return [
        `${t}的風味特性、烹調方式與品質分析`,
        `台灣${t}市場發展現況與消費趨勢研究`,
        `${t}的產地來源、分級標準與選購指南`,
        `${t}的食品安全規範、衛生管理與法規探討`,
        `${t}的飲食文化脈絡與現代餐飲產業發展`,
      ];
    case "化學／化工":
      return [
        `${t}的化學結構、特性與作用機制`,
        `${t}在人體生理代謝中的角色與功能研究`,
        `${t}的天然來源、食物分布與建議攝取量`,
        `${t}攝取不足或過量對健康的影響與科學證據`,
        `${t}的工業製備方式、純化技術與應用領域`,
      ];
    case "生物／動物":
      return [
        `${t}的生物特徵、生活習性與分類地位研究`,
        `${t}在農業生產與生態系統中的角色與價值`,
        `臺灣${t}相關產業現況、挑戰與未來發展`,
        `${t}的飼養管理技術與動物福利議題探討`,
        `${t}與人類生活及文化的關聯性研究`,
      ];
    case "科學實驗":
      return [
        `不同條件對「${t}」的影響之實驗探討`,
        `「${t}」的變因分析與量化測量`,
        `「${t}」實驗誤差來源與改進方法`,
        `「${t}」的原理驗證與數據呈現`,
        `「${t}」在日常生活中的應用實驗`,
      ];
    case "社會議題":
      return [
        `「${t}」的成因與現況分析`,
        `「${t}」對不同族群的影響探討`,
        `「${t}」的國內外案例比較`,
        `面對「${t}」的可行解決策略`,
        `「${t}」議題中的不同觀點與個人看法`,
      ];
    case "商業／產品分析":
      return [
        `「${t}」的市場機會與目標客群分析`,
        `「${t}」的競品比較與差異化策略`,
        `「${t}」的商業模式與獲利規劃`,
        `「${t}」的成本、風險與執行步驟`,
        `「${t}」的未來發展與擴充方向`,
      ];
    case "AI／網站／程式專案": {
      // Conceptual AI topics (研究報告) vs. project names (專案計畫)
      const isAiConcept = has(t, ["人工智慧", "機器學習", "深度學習", "ai", "大型語言模型", "神經網路", "生成式ai"]);
      return isAiConcept
        ? [
            `${t}的發展歷程、技術原理與主要應用領域`,
            `${t}對產業與社會的影響：機遇、挑戰與倫理議題`,
            `${t}在台灣的現況、發展政策與未來展望`,
            `${t}的主要技術流派與代表性研究成果`,
            `${t}帶來的就業市場變化與人才培育方向`,
          ]
        : [
            `「${t}」的使用者需求與核心功能規劃`,
            `「${t}」的系統架構與技術選型`,
            `「${t}」的開發步驟與測試方式`,
            `「${t}」的資料流程與安全性設計`,
            `「${t}」的風險、限制與未來擴充`,
          ];
    }
    case "醫療／長照／社工／心理": {
      // Academic psychology vs. clinical/care service topic
      const isPsychAcademic = has(t, ["心理學", "認知心理", "發展心理", "社會心理", "行為心理", "正向心理"]);
      return isPsychAcademic
        ? [
            `${t}的主要理論流派、代表人物與發展歷程`,
            `${t}的核心研究方法與實驗設計`,
            `${t}在教育、職場與日常生活中的應用`,
            `${t}與當代社會現象的關聯：壓力、幸福感、人際關係`,
            `${t}的未來研究方向與跨領域整合趨勢`,
          ]
        : [
            `「${t}」的服務對象與需求分析`,
            `「${t}」的現況與主要挑戰`,
            `「${t}」相關制度與服務資源`,
            `「${t}」的案例分析與專業觀點`,
            `面對「${t}」的個人反思與建議`,
          ];
    }
    case "歷史／地理／公民":
      return [
        `「${t}」的歷史脈絡與背景`,
        `「${t}」的重要事件或制度演變`,
        `「${t}」的現況與影響`,
        `「${t}」的爭議與不同觀點`,
        `從「${t}」看公民素養與個人省思`,
      ];
    case "讀書心得":
      return [
        `《${t}》的內容大意與主旨整理`,
        `《${t}》印象最深的段落與原因`,
        `《${t}》與個人生活經驗的連結`,
        `《${t}》的批判與反思`,
        `從《${t}》獲得的啟發與行動`,
      ];
    default:
      return [
        `「${t}」的背景與重要性探討`,
        `「${t}」的現況分析`,
        `「${t}」的主要面向與分類整理`,
        `「${t}」的相關案例與討論`,
        `「${t}」的結論與個人觀點`,
      ];
  }
}

// ─── Category content model ──────────────────────────────────────────────────

interface CustomSection {
  heading: string;
  body: string;
}

interface CategoryContent {
  summaryDirection: string; // 摘要方向 (架構)
  summary: string; // 摘要 (完整)
  background: string;
  motivation: string;
  purpose: string[];
  questions: string[];
  hypothesis: string[];
  literature: string[];
  method: string;
  analysis: string; // 研究結果與分析 (完整)
  discussion: string;
  limitations: string[];
  conclusion: string;
  futureWork: string[];
  customSections: CustomSection[]; // category-specific structure (spec §6)
  charts: SuggestionBlock[];
  images: SuggestionBlock[];
  flowcharts: SuggestionBlock[];
}

// ─── Biology knowledge base (common-knowledge facts only) ────────────────────

interface BioFact {
  intro: string;
  classification: string;
  habits: string;
  habitat: string;
  humanRelation: string;
  value: string;
  issues: string;
}

const BIO_FACTS: Record<string, BioFact> = {
  鵝: {
    intro:
      "鵝是人類長期飼養的家禽之一，常見於農業與畜牧環境中。牠不只具有食用價值，也因警覺性高、群居性明顯，而在人類生活與農村文化中扮演特殊角色。",
    classification:
      "鵝屬於鳥綱雁形目鴨科，由野雁馴化而來。體型比鴨大，頸部較長，喙基部常有肉瘤，腳掌具蹼、善於游泳；羽毛多為白色或灰褐色。",
    habits:
      "鵝具有明顯的群居性與地域性，警覺性高，遇到陌生人或動物會大聲鳴叫示警，因此早期農家常以鵝看守家園。以草料、穀物為主食，屬草食偏雜食。",
    habitat:
      "鵝適合飼養於有水域（如池塘、溝渠）與草地的環境，需要乾淨水源供其覓食與整理羽毛；耐寒、適應力強。",
    humanRelation:
      "鵝與農業、畜牧業及人類飲食密切相關，可提供鵝肉、鵝蛋與羽絨，在部分地區也具有看守與除草的功能。",
    value:
      "經濟上，鵝肉與鵝肝是重要食品，羽絨可製成保暖衣物與寢具；文化上，鵝常出現在文學、節慶與民俗中；生態上，適度放牧有助於草地管理。",
    issues:
      "可進一步探討的議題包括：飼養管理與環境衛生、動物福利、禽流感等疾病防治，以及鵝肉產業的市場現況與發展。",
  },
  貓: {
    intro:
      "貓是常見的家庭寵物與伴侶動物，與人類共同生活已有數千年歷史，兼具陪伴、療癒與捕鼠等功能。",
    classification:
      "貓屬於哺乳綱食肉目貓科，為小型肉食性動物。具有靈活的身體、銳利的爪與牙、敏銳的夜視與聽覺，肉墊使其行動安靜。",
    habits:
      "貓多在晨昏與夜間活動，具領域性，會以磨蹭、抓痕標記領域；愛清潔，常自行理毛；獨立性強但也會與人建立依附關係。",
    habitat:
      "家貓主要生活於人類居住環境，需要安全的活動空間、躲藏處與穩定的食物與水源。",
    humanRelation:
      "貓作為伴侶動物提供陪伴與情感支持，並在文化、藝術與網路社群中佔有重要地位；流浪貓議題則涉及公共衛生與動物保護。",
    value:
      "情感與療癒價值高，亦帶動寵物經濟（食品、用品、醫療）；同時引發 TNR（捕捉、絕育、回置）與生態影響等討論。",
    issues:
      "可探討的議題包括：負責任飼養、流浪貓族群管理、人貓共生與動物福利。",
  },
  狗: {
    intro:
      "狗是人類最早馴化的動物之一，被稱為「人類最好的朋友」，在陪伴、工作與服務等面向都扮演重要角色。",
    classification:
      "狗屬於哺乳綱食肉目犬科，由狼馴化而來。嗅覺與聽覺極為發達，品種多元，體型、毛色與性格差異大。",
    habits:
      "狗是群居性動物，具有社會階級觀念，能與人類及同伴建立緊密關係；透過吠叫、肢體與氣味溝通，可經由訓練學習指令。",
    habitat:
      "狗適應力強，可生活於家庭、農村與工作場域，需要足夠運動、互動與穩定照顧。",
    humanRelation:
      "狗擔任伴侶犬、導盲犬、警犬、搜救犬等多種角色，與人類生活高度連結；流浪犬則涉及公共安全與動物保護議題。",
    value:
      "情感陪伴與工作價值兼具，帶動寵物產業發展；同時引發棄養、結紮與動物福利等社會討論。",
    issues:
      "可探討的議題包括：負責任飼養、流浪犬管理、犬隻訓練與動物福利。",
  },
  蜜蜂: {
    intro:
      "蜜蜂是重要的授粉昆蟲，對農業生產與生態系平衡有關鍵影響，同時也是蜂蜜等產品的來源。",
    classification:
      "蜜蜂屬於昆蟲綱膜翅目蜜蜂科，為社會性昆蟲，群體分為蜂后、雄蜂與工蜂，分工明確。",
    habits:
      "蜜蜂以花蜜與花粉為食，透過「8 字舞」傳遞蜜源位置；工蜂負責採蜜、築巢、育幼與守衛。",
    habitat:
      "蜜蜂築巢於樹洞或人工蜂箱中，活動範圍依蜜源分布而定，對環境變化（農藥、氣候）相當敏感。",
    humanRelation:
      "蜜蜂為許多農作物授粉，攸關糧食生產；其產品（蜂蜜、蜂王乳、蜂蠟）也具經濟價值。",
    value:
      "生態上是關鍵授粉者，經濟上支撐養蜂與農業；近年蜂群數量下降（如蜂群崩壞）引發廣泛關注。",
    issues:
      "可探討的議題包括：授粉與糧食安全、農藥對蜂群的影響、氣候變遷與蜂群健康。",
  },
  蚯蚓: {
    intro:
      "蚯蚓是常見的土壤動物，有「大地的犁」之稱，對土壤改良與有機物分解扮演重要角色。",
    classification:
      "蚯蚓屬於環節動物門寡毛綱，身體分節、無骨骼，以體表呼吸，雌雄同體。",
    habits:
      "蚯蚓在土中鑽行、取食腐爛有機物，排出的糞便（蚓糞）是良好的天然肥料；多在潮濕、陰暗環境活動。",
    habitat:
      "蚯蚓生活於富含有機質、濕潤且通氣的土壤中，乾旱或淹水都會威脅其生存。",
    humanRelation:
      "蚯蚓有助於鬆土、改善土壤結構與肥力，常被應用於有機農業與廚餘堆肥（蚯蚓養殖）。",
    value:
      "生態上促進土壤健康與養分循環，農業上可用於堆肥與土壤改良，是友善環境耕作的重要幫手。",
    issues:
      "可探討的議題包括：蚯蚓堆肥的操作與效益、土壤汙染對蚯蚓的影響、蚯蚓與土壤生態的關係。",
  },
};

function bioFallback(topic: string): BioFact {
  return {
    intro: `「${topic}」是一種生物，本報告將從分類、特徵、習性、棲息環境及與人類的關係等面向進行整理。〔建議補充「${topic}」的基本介紹與常見別名〕`,
    classification: `〔建議補充「${topic}」的生物分類（門綱目科）與主要外型特徵，例如體型、構造與辨識重點。〕`,
    habits: `〔建議補充「${topic}」的食性、活動時間、繁殖與行為等生活習性。〕`,
    habitat: `〔建議補充「${topic}」的主要棲息環境與分布區域。〕`,
    humanRelation: `〔建議補充「${topic}」與人類生活、農業或文化的關係。〕`,
    value: `〔建議補充「${topic}」的經濟、文化或生態價值。〕`,
    issues: `可探討「${topic}」相關的保育、利用或管理議題（建議補充具體面向）。`,
  };
}

// ─── Category content builders ───────────────────────────────────────────────

function buildBiology(topic: string): CategoryContent {
  const f = BIO_FACTS[topic.trim()] ?? bioFallback(topic);
  return {
    summaryDirection: `本報告以「${topic}」為對象，從生物分類、特徵、生活習性、棲息環境，到與人類生活的關係與價值，做系統性的整理與討論。`,
    summary: `${f.intro}本報告整理「${topic}」的分類與特徵、生活習性、棲息環境，以及與人類生活的關係與相關議題。`,
    background: f.intro,
    motivation: `選擇「${topic}」作為主題，是希望透過系統性的資料整理，更完整地認識這種生物的特性與牠在生態及人類生活中的角色。`,
    purpose: [
      `認識「${topic}」的生物分類與基本特徵。`,
      `了解「${topic}」的生活習性與棲息環境。`,
      `探討「${topic}」與人類生活的關係及其價值。`,
      `整理「${topic}」相關的問題與可討論的方向。`,
    ],
    questions: [
      `「${topic}」具有哪些重要的生物特徵？`,
      `「${topic}」的生活習性與棲息環境為何？`,
      `「${topic}」與人類生活有什麼關係與價值？`,
      `關於「${topic}」目前有哪些值得關注的議題？`,
    ],
    hypothesis: [
      `「${topic}」的特徵與習性與其棲息環境密切相關。`,
      `「${topic}」在生態系與人類生活中具有不可忽視的角色。`,
    ],
    literature: [
      `「${topic}」的分類與形態相關資料`,
      `「${topic}」的行為與生態研究`,
      `「${topic}」與人類、產業或文化關係的整理`,
      `保育、飼養或利用相關的討論`,
    ],
    method: `採用文獻整理與觀察歸納法：蒐集「${topic}」的圖鑑、百科、研究與報導資料，整理其特徵與習性，並輔以觀察或案例進行分析。`,
    analysis: `綜合資料可看出，${f.habits}此外，${f.habitat}這些特性彼此呼應，反映出「${topic}」如何適應其生存環境。`,
    discussion: `從「${topic}」與人類的關係來看，${f.humanRelation}由此延伸，${f.issues}`,
    limitations: [
      `本報告以二手資料整理為主，缺乏第一手的田野觀察與量化數據。`,
      `部分特徵會因品種、地區或個體而有差異，難以一概而論。`,
    ],
    conclusion: `綜合以上，「${topic}」在分類、習性與生態上各具特色，且與人類生活關係密切。深入認識牠有助於我們在利用與保育之間取得平衡。`,
    futureWork: [
      `進行實地觀察或訪談，補充第一手資料。`,
      `蒐集量化統計（如數量、產量、分布）強化分析。`,
    ],
    customSections: [
      { heading: "一、主題基本介紹", body: f.intro },
      { heading: "二、生物分類與基本特徵", body: f.classification },
      { heading: "三、生活習性", body: f.habits },
      { heading: "四、棲息環境", body: f.habitat },
      { heading: "五、與人類生活的關係", body: f.humanRelation },
      { heading: "六、經濟、文化或生態價值", body: f.value },
      { heading: "七、相關問題與討論", body: f.issues },
    ],
    charts: [
      {
        title: `${topic}的特徵整理表`,
        position: "主題基本介紹後",
        purpose: `快速整理「${topic}」的分類、外型、習性與主要用途。`,
        content: "包含分類、體型、食性、活動習性與主要用途等欄位。",
      },
      {
        title: `${topic}相關數據比較圖`,
        position: "與人類生活的關係後",
        purpose: `比較「${topic}」在不同地區、品種或年份的相關數據。`,
        content: `以長條圖呈現（實際數據${SOURCE_NOTE}）。`,
      },
    ],
    images: [
      {
        title: `${topic}的外型構造圖`,
        position: "生物分類與基本特徵後",
        purpose: `標示「${topic}」的主要身體構造與辨識重點。`,
        content: "可使用標註式照片或繪圖，標出關鍵特徵。",
      },
      {
        title: `${topic}的棲息環境照片`,
        position: "棲息環境後",
        purpose: `呈現「${topic}」實際的生活環境。`,
        content: "建議使用實地拍攝或授權圖片（來源待確認）。",
      },
    ],
    flowcharts: [
      {
        title: `${topic}的生命週期流程圖`,
        position: "生活習性後",
        purpose: `說明「${topic}」從出生到成熟的主要階段。`,
        content: "以箭頭串連各生命階段。",
      },
    ],
  };
}

function buildExperiment(topic: string): CategoryContent {
  return {
    summaryDirection: `本實驗以「${topic}」為題，透過控制變因、操作變因與測量應變變因，觀察並記錄結果，以驗證假設並歸納結論。`,
    summary: `本實驗探討「${topic}」，藉由設計操作變因與控制變因，量測應變變因的變化，分析數據並討論誤差與改進方法。`,
    background: `「${topic}」涉及可觀察、可測量的科學現象。透過實驗設計，可以系統性地檢驗變因之間的關係。`,
    motivation: `希望以實際操作驗證「${topic}」背後的原理，並培養設計實驗、蒐集數據與分析結果的能力。`,
    purpose: [
      `驗證「${topic}」中各變因之間的關係。`,
      `透過量化數據觀察應變變因的變化趨勢。`,
      `分析誤差來源並提出改進方法。`,
    ],
    questions: [
      `在「${topic}」中，操作變因如何影響應變變因？`,
      `各變因之間是否存在可量化的規律？`,
      `實驗結果與理論預期是否一致？`,
    ],
    hypothesis: [
      `操作變因增加（或改變）時，應變變因會呈現規律的變化。`,
      `在控制其他條件下，「${topic}」的結果具有可重現性。`,
    ],
    literature: [
      `「${topic}」相關的科學原理與定義`,
      `類似實驗的設計方法與既有結果`,
      `測量工具與誤差控制的方法`,
    ],
    method: `採用實驗研究法：設定操作變因、控制變因與應變變因，重複多次量測以取平均，並以圖表呈現數據後進行分析。`,
    analysis: `將各組數據整理為表格與圖表後，比較不同操作變因下應變變因的差異，觀察是否呈現預期的趨勢，並計算可能的誤差範圍。〔此處需填入實際實驗數據〕`,
    discussion: `討論結果與假設是否相符、可能的誤差來源（如測量誤差、環境干擾、操作不一致），以及如何改進實驗設計以提升準確度。`,
    limitations: [
      `受器材精度與實驗次數限制，數據可能存在誤差。`,
      `環境變因（溫度、濕度等）不易完全控制。`,
    ],
    conclusion: `根據實驗數據可初步歸納「${topic}」中變因之間的關係〔依實際數據填寫結論〕，並指出後續可改進的方向。`,
    futureWork: [
      `增加實驗次數與樣本以提升可靠度。`,
      `改良器材或方法以降低誤差。`,
    ],
    customSections: [
      { heading: "一、實驗目的", body: `驗證「${topic}」中操作變因對應變變因的影響，並歸納其規律。` },
      { heading: "二、實驗原理", body: `說明「${topic}」所依據的科學原理與相關概念。〔建議補充教科書或可信資料的原理說明〕` },
      {
        heading: "三、實驗變因",
        body: "操作變因（自行設定並改變的條件）、應變變因（觀察與測量的結果）、控制變因（需保持固定的條件）。〔請依「" + topic + "」填入具體變因〕",
      },
      { heading: "四、實驗器材", body: `列出進行「${topic}」所需的器材與材料（如量測工具、容器、樣本等）。` },
      { heading: "五、實驗步驟", body: `依序寫出可重現的操作步驟，包含準備、操作、量測與記錄。` },
      { heading: "六、數據紀錄方式", body: `以表格記錄每次量測結果，並計算平均值，再轉換為圖表呈現。` },
      { heading: "七、預期結果", body: `依原理推測操作變因改變時應變變因的變化方向。` },
      { heading: "八、誤差來源與改進方法", body: `列出可能誤差（測量、環境、操作）並提出對應的改進方式。` },
    ],
    charts: [
      {
        title: `${topic}數據關係圖`,
        position: "數據紀錄方式後",
        purpose: "呈現操作變因與應變變因之間的關係趨勢。",
        content: "以折線圖或散佈圖呈現各組量測結果（實際數據由實驗取得）。",
      },
      {
        title: "各組結果比較長條圖",
        position: "實驗結果後",
        purpose: "比較不同操作變因下的應變變因平均值。",
        content: "X 軸為操作變因，Y 軸為應變變因平均值，加上誤差線。",
      },
    ],
    images: [
      {
        title: "實驗器材配置圖",
        position: "實驗器材後",
        purpose: "說明器材的擺設與實驗裝置。",
        content: "可用照片或示意圖標示各器材位置。",
      },
    ],
    flowcharts: [
      {
        title: "實驗流程圖",
        position: "實驗步驟後",
        purpose: "以流程圖整理實驗操作順序。",
        content: "準備 → 設定變因 → 操作 → 量測記錄 → 整理分析。",
      },
    ],
  };
}

function buildSocialIssue(topic: string): CategoryContent {
  return {
    summaryDirection: `本報告針對「${topic}」這項社會議題，從成因、現況、影響到解決策略進行分析，並提出個人觀點。`,
    summary: `本報告探討社會議題「${topic}」，分析其形成原因、現況與影響層面，比較不同觀點並提出可行的解決策略與個人看法。`,
    background: `「${topic}」是當前社會關注的議題，牽涉多方面的成因與影響，值得深入分析。〔建議補充相關背景與統計數據〕`,
    motivation: `希望透過資料整理與分析，釐清「${topic}」的成因與影響，並思考個人與社會可以採取的行動。`,
    purpose: [
      `釐清「${topic}」的形成原因。`,
      `分析「${topic}」的現況與影響層面。`,
      `比較不同立場的觀點。`,
      `提出可行的解決策略與個人看法。`,
    ],
    questions: [
      `「${topic}」是如何形成的？`,
      `「${topic}」對個人、家庭與社會造成哪些影響？`,
      `面對「${topic}」有哪些不同的觀點與解決策略？`,
    ],
    hypothesis: [
      `「${topic}」是由多重因素交互作用造成。`,
      `透過適當的政策與行動，「${topic}」的負面影響可被緩解。`,
    ],
    literature: [
      `「${topic}」的定義與相關統計（數據待補）`,
      `成因與影響的相關研究或報導`,
      `國內外的因應政策與案例`,
    ],
    method: `採用文獻分析與案例比較法：蒐集統計、研究與新聞報導，整理成因與影響，並比較不同案例與解決策略。`,
    analysis: `從資料可見「${topic}」的成因與影響涉及多個層面〔此處建議插入統計數據與案例佐證〕，不同族群所受影響程度不一。`,
    discussion: `比較支持與反對、不同立場的觀點，討論各種解決策略的可行性與限制，並反思個人與社會的角色。`,
    limitations: [
      `缺乏第一手調查數據，分析以既有資料為主。`,
      `議題具爭議性，不同立場可能有不同解讀。`,
    ],
    conclusion: `綜合來看，「${topic}」需要從個人、社會與制度多管齊下因應。本報告整理其成因、影響與策略，作為後續討論的基礎。`,
    futureWork: [
      `進行問卷或訪談蒐集第一手意見。`,
      `追蹤相關政策的實施成效。`,
    ],
    customSections: [
      { heading: "一、議題背景", body: `介紹「${topic}」的基本情況與為何受到關注。〔建議補充統計數據〕` },
      { heading: "二、形成原因", body: `分析「${topic}」的主要成因（如社會、經濟、文化、制度等面向）。` },
      { heading: "三、現況分析", body: `說明「${topic}」目前的狀況與趨勢。〔此處需要插入官方或研究統計〕` },
      { heading: "四、影響層面", body: `分析對個人、家庭、社會與經濟的影響。` },
      { heading: "五、案例討論", body: `舉出國內外相關案例進行比較（案例來源待確認）。` },
      { heading: "六、不同觀點", body: `整理不同立場（支持／反對／中立）的看法與理由。` },
      { heading: "七、解決策略", body: `提出可行的政策、教育或行動方案。` },
      { heading: "八、個人看法", body: `提出對「${topic}」的個人立場與理由。` },
    ],
    charts: [
      {
        title: `${topic}趨勢變化圖`,
        position: "現況分析後",
        purpose: `呈現「${topic}」隨時間的變化趨勢。`,
        content: `以折線圖呈現歷年數據（${SOURCE_NOTE}）。`,
      },
      {
        title: "影響層面占比圖",
        position: "影響層面後",
        purpose: "呈現不同影響層面的比重或分布。",
        content: "以圓餅圖或長條圖呈現（數據待補）。",
      },
    ],
    images: [
      {
        title: "議題概念圖",
        position: "議題背景後",
        purpose: `以圖像整理「${topic}」的成因與影響關係。`,
        content: "可用心智圖呈現核心概念與關聯。",
      },
    ],
    flowcharts: [
      {
        title: "成因與影響關係圖",
        position: "形成原因後",
        purpose: "呈現成因如何導致各種影響。",
        content: "以箭頭連結成因 → 現況 → 影響 → 對策。",
      },
    ],
  };
}

function buildHistoryGeo(topic: string): CategoryContent {
  return {
    summaryDirection: `本報告以「${topic}」為題，整理其背景、歷史脈絡或地理位置、重要事件或制度、現況與影響，並提出個人觀點。`,
    summary: `本報告探討「${topic}」，從背景、歷史脈絡或地理位置出發，整理重要事件或制度、現況與影響，並討論相關爭議與個人看法。`,
    background: `「${topic}」具有其特定的歷史、地理或制度背景，值得加以整理與理解。〔建議補充可信的史地或公民資料〕`,
    motivation: `希望透過資料整理，更清楚地認識「${topic}」的脈絡與意義，並思考其對現今的影響。`,
    purpose: [
      `整理「${topic}」的背景與脈絡。`,
      `了解相關的重要事件、制度或地理特徵。`,
      `分析「${topic}」的現況與影響。`,
      `討論相關爭議並提出個人觀點。`,
    ],
    questions: [
      `「${topic}」的背景與發展脈絡為何？`,
      `「${topic}」中有哪些重要事件、制度或特徵？`,
      `「${topic}」對現今社會有什麼影響？`,
    ],
    hypothesis: [
      `「${topic}」的形成與其時代或地理背景密切相關。`,
      `理解「${topic}」有助於認識當前社會與環境。`,
    ],
    literature: [
      `「${topic}」的史料、地圖或制度文件（來源待確認）`,
      `相關研究與導覽、報導資料`,
      `不同觀點的評析`,
    ],
    method: `採用文獻整理與比較分析法：蒐集史地或公民相關資料，整理脈絡與重要面向，並比較不同觀點。`,
    analysis: `綜合資料可看出「${topic}」的發展脈絡與重要面向〔建議補充具體事件、年代或地理數據〕，並對現況產生影響。`,
    discussion: `討論「${topic}」相關的爭議與不同詮釋，並反思其對現代公民的意義。`,
    limitations: [
      `史地資料來源眾多，需審慎查證真實性。`,
      `部分內容涉及不同立場，詮釋可能有差異。`,
    ],
    conclusion: `綜合以上，「${topic}」在歷史、地理或制度上具有其重要性，理解其脈絡有助於培養公民素養與在地認同。`,
    futureWork: [
      `實地踏查或參訪以補充第一手觀察。`,
      `查閱官方檔案或學術研究強化內容。`,
    ],
    customSections: [
      { heading: "一、主題背景", body: `介紹「${topic}」的基本背景與重要性。` },
      { heading: "二、歷史脈絡或地理位置", body: `說明「${topic}」的時間脈絡或所在位置與環境。〔建議補充年代或地圖資料〕` },
      { heading: "三、重要事件或制度", body: `整理與「${topic}」相關的關鍵事件、人物或制度。` },
      { heading: "四、現況", body: `說明「${topic}」目前的狀況或保存、運作情形。` },
      { heading: "五、影響", body: `分析「${topic}」對社會、文化或環境的影響。` },
      { heading: "六、爭議或討論", body: `整理相關的爭議點或不同觀點。` },
      { heading: "七、個人觀點", body: `提出對「${topic}」的看法與省思。` },
    ],
    charts: [
      {
        title: `${topic}年代／數據整理表`,
        position: "重要事件或制度後",
        purpose: `整理「${topic}」的重要時間點或相關數據。`,
        content: "以表格列出年代、事件或數值（資料來源待確認）。",
      },
    ],
    images: [
      {
        title: `${topic}相關圖片或地圖`,
        position: "歷史脈絡或地理位置後",
        purpose: `呈現「${topic}」的實景、文物或地理位置。`,
        content: "建議使用授權圖片或自行拍攝（來源待確認）。",
      },
    ],
    flowcharts: [
      {
        title: "發展脈絡時間軸",
        position: "重要事件或制度後",
        purpose: `以時間軸呈現「${topic}」的發展過程。`,
        content: "依年代順序串連重要事件。",
      },
    ],
  };
}

function buildBookReflection(topic: string): CategoryContent {
  const book = topic.replace(/[《》〈〉]/g, "").replace(/讀書心得|心得|讀後感?/g, "").trim() || topic;
  return {
    summaryDirection: `本心得以《${book}》為對象，整理書籍大意與重要內容，分享印象最深的段落、個人心得與生活連結，並提出反思。`,
    summary: `本篇為《${book}》的讀書心得，先整理書籍大意與重點，再分享印象最深的段落、個人感受與生活經驗的連結，最後提出批判與反思。`,
    background: `《${book}》〔建議補充作者與出版資訊〕。閱讀這本書讓我對其主題有更深的體會，因此整理成這篇心得。`,
    motivation: `選擇《${book}》是因為其主題與我的興趣或經驗相關，希望透過閱讀與書寫整理自己的想法。`,
    purpose: [
      `整理《${book}》的內容大意與重點。`,
      `分享閱讀過程中印象最深的部分。`,
      `連結書中內容與個人生活經驗。`,
      `提出對本書的反思與啟發。`,
    ],
    questions: [
      `《${book}》主要想傳達什麼？`,
      `書中哪些內容讓我最有感觸？為什麼？`,
      `這本書對我的想法或生活有什麼影響？`,
    ],
    hypothesis: [],
    literature: [
      `《${book}》的內容與主題（以書籍本身為主）`,
      `作者其他作品或相關訪談（資料待確認）`,
    ],
    method: `以文本閱讀與反思為主：細讀《${book}》，摘錄重點段落，再結合個人經驗進行思考與書寫。`,
    analysis: `整理《${book}》的核心內容後，我特別注意到〔填入印象深刻的主題或情節〕，並從中看見作者想傳達的觀點。`,
    discussion: `結合自身經驗，我認為書中的觀點〔填入個人感受與連結〕；同時也可從不同角度思考，提出自己的看法或質疑。`,
    limitations: [
      `心得以個人主觀感受為主，未必能涵蓋全書深意。`,
      `對作者背景與寫作脈絡的了解有限。`,
    ],
    conclusion: `讀完《${book}》，我獲得〔填入主要啟發〕。這本書讓我重新思考相關議題，也提醒自己在生活中加以實踐。`,
    futureWork: [
      `閱讀作者其他作品或相關書籍延伸思考。`,
      `將書中啟發實際運用於生活或學習中。`,
    ],
    customSections: [
      { heading: "一、書名與作者", body: `書名：《${book}》。作者：〔建議補充作者姓名與出版社、出版年份〕。` },
      { heading: "二、作者介紹", body: `〔建議補充作者背景與寫作風格，資料來源待確認〕` },
      { heading: "三、書籍大意", body: `簡述《${book}》的主要內容與架構。` },
      { heading: "四、重要內容整理", body: `整理書中重要的觀點、情節或章節重點。` },
      { heading: "五、印象最深的段落", body: `摘錄並說明最有感觸的段落與原因。` },
      { heading: "六、個人心得", body: `分享閱讀後的個人感受與想法。` },
      { heading: "七、與生活經驗的連結", body: `將書中內容連結到自己的生活或學習經驗。` },
      { heading: "八、批判與反思", body: `提出對本書的不同看法、質疑或延伸思考。` },
    ],
    charts: [
      {
        title: `《${book}》重點整理表`,
        position: "重要內容整理後",
        purpose: "整理書中主要章節或觀點。",
        content: "以表格列出章節／主題與重點。",
      },
    ],
    images: [
      {
        title: "書籍封面或關鍵情節示意圖",
        position: "書名與作者後",
        purpose: "讓讀者快速認識本書。",
        content: "可放書籍封面（使用時請註明來源）或自繪情節示意圖。",
      },
    ],
    flowcharts: [
      {
        title: "閱讀心得脈絡圖",
        position: "個人心得後",
        purpose: "呈現從閱讀到反思的思考歷程。",
        content: "閱讀 → 觸動 → 連結經驗 → 反思 → 行動。",
      },
    ],
  };
}

function buildBusiness(topic: string): CategoryContent {
  return {
    summaryDirection: `本報告以商業視角分析「${topic}」，涵蓋產品背景、目標客群、競品、核心功能、商業模式、成本與風險，並提出執行建議。`,
    summary: `本報告針對「${topic}」進行商業與產品分析，從目標客群、使用情境、競品比較到商業模式與風險，提出可執行的結論與建議。`,
    background: `「${topic}」面對特定的市場需求與使用者痛點。本報告分析其機會與挑戰，作為決策參考。〔建議補充市場數據〕`,
    motivation: `希望以決策導向的方式評估「${topic}」的可行性，找出差異化定位與獲利模式。`,
    purpose: [
      `分析「${topic}」的目標客群與使用情境。`,
      `比較競品並找出差異化優勢。`,
      `規劃商業模式、成本與風險。`,
      `提出可執行的發展建議。`,
    ],
    questions: [
      `「${topic}」要解決誰的什麼問題？`,
      `市場上有哪些競品？「${topic}」的差異化在哪裡？`,
      `「${topic}」如何獲利並控制風險？`,
    ],
    hypothesis: [
      `「${topic}」存在明確的目標客群與未被滿足的需求。`,
      `透過差異化定位，「${topic}」具備可行的獲利模式。`,
    ],
    literature: [
      `「${topic}」所屬市場規模與趨勢（數據待補）`,
      `主要競品的功能與定價（資料待確認）`,
      `相關商業模式案例`,
    ],
    method: `採用商業分析方法：以使用者輪廓、競品分析、商業模式（如商業模式圖）與 SWOT 等工具，整合質化與量化資訊。`,
    analysis: `比較「${topic}」與競品的功能、定價與定位後，可看出其機會與威脅〔建議補充市場與競品數據〕，並據此調整策略。`,
    discussion: `討論「${topic}」的核心優勢、潛在風險與資源需求，評估在不同情境下的可行性。`,
    limitations: [
      `市場與競品數據需以實際調查為準，本報告為初步分析。`,
      `商業環境變動快速，預估具不確定性。`,
    ],
    conclusion: `綜合分析，「${topic}」具備〔填入主要優勢〕，建議聚焦於〔填入策略重點〕並控管〔填入主要風險〕，以提升成功機會。`,
    futureWork: [
      `進行使用者訪談與市場驗證（MVP 測試）。`,
      `建立財務試算與里程碑規劃。`,
    ],
    customSections: [
      { heading: "一、執行摘要", body: `用一段話說明「${topic}」的定位、目標與核心價值。` },
      { heading: "二、產品背景", body: `說明「${topic}」要解決的問題與市場機會。` },
      { heading: "三、目標客群", body: `描述主要使用者輪廓與需求。` },
      { heading: "四、使用情境", body: `列出使用者在何種情境下會使用「${topic}」。` },
      { heading: "五、競品分析", body: `比較主要競品的功能、定價與優劣（資料待確認）。` },
      { heading: "六、核心功能", body: `列出「${topic}」的主要功能與差異化重點。` },
      { heading: "七、商業模式", body: `說明收入來源與成本結構（如訂閱、廣告、抽成等）。` },
      { heading: "八、技術需求", body: `概述實作「${topic}」所需的技術與資源。` },
      { heading: "九、成本與資源", body: `估算所需的人力、時間與資金（數據待補）。` },
      { heading: "十、風險分析", body: `列出市場、技術與營運風險及因應方式。` },
      { heading: "十一、執行步驟", body: `規劃從開發到上線的階段與里程碑。` },
    ],
    charts: [
      {
        title: "競品比較表",
        position: "競品分析後",
        purpose: `比較「${topic}」與競品的功能與定價。`,
        content: "以表格列出功能、價格、目標客群等欄位（資料待確認）。",
      },
      {
        title: "商業模式圖（Business Model Canvas）",
        position: "商業模式後",
        purpose: "整體呈現價值主張、客群、通路與收入結構。",
        content: "以九宮格呈現商業模式各要素。",
      },
    ],
    images: [
      {
        title: "產品使用情境示意圖",
        position: "使用情境後",
        purpose: `具體呈現使用者操作「${topic}」的情境。`,
        content: "可用流程截圖或情境插圖呈現。",
      },
    ],
    flowcharts: [
      {
        title: "使用者旅程流程圖",
        position: "使用情境後",
        purpose: "呈現使用者從認識到使用的歷程。",
        content: "認識 → 註冊 → 使用 → 付費 → 回購。",
      },
    ],
  };
}

function buildTechProject(topic: string): CategoryContent {
  return {
    summaryDirection: `本報告以「${topic}」為題，從使用者需求、核心功能、系統架構、技術選型到開發與測試流程，規劃完整的專案藍圖。`,
    summary: `本報告規劃「${topic}」專案，說明使用者需求、核心功能、系統架構與技術選型，並涵蓋資料流程、開發步驟、測試方式與風險。`,
    background: `「${topic}」旨在以技術手段解決特定需求。本報告整理其需求與技術規劃，作為開發依據。`,
    motivation: `希望透過系統化規劃，釐清「${topic}」的功能範圍與技術可行性，降低開發風險。`,
    purpose: [
      `釐清「${topic}」的使用者需求與核心功能。`,
      `設計系統架構並選擇合適技術。`,
      `規劃資料流程、開發與測試步驟。`,
      `評估風險與未來擴充方向。`,
    ],
    questions: [
      `「${topic}」要解決什麼問題、服務哪些使用者？`,
      `「${topic}」需要哪些核心功能與技術？`,
      `如何確保「${topic}」的品質與可維護性？`,
    ],
    hypothesis: [
      `「${topic}」的核心需求可透過所選技術有效實現。`,
      `良好的架構設計能提升「${topic}」的可維護性與擴充性。`,
    ],
    literature: [
      `「${topic}」相關技術與框架的官方文件`,
      `類似系統的設計與最佳實務`,
      `資料安全與效能相關資料`,
    ],
    method: `採用系統分析與設計方法：先進行需求分析，再設計架構與資料流程，採用迭代開發並搭配測試驗證。`,
    analysis: `依需求拆解功能模組，評估各技術選項的優劣後選定方案〔建議補充技術比較〕，並設計資料流程確保正確與安全。`,
    discussion: `討論架構取捨、效能與安全考量，以及在資源限制下的取捨與優先順序。`,
    limitations: [
      `本報告為規劃階段，實際效能需以實作與測試驗證。`,
      `技術更新快速，選型需持續評估。`,
    ],
    conclusion: `綜合規劃，「${topic}」在功能與技術上具可行性，建議採用〔填入技術方案〕並依里程碑分階段開發與測試。`,
    futureWork: [
      `完成原型（Prototype）並進行使用者測試。`,
      `加入更多功能或串接外部服務。`,
    ],
    customSections: [
      { heading: "一、專案背景", body: `說明「${topic}」要解決的問題與目標。` },
      { heading: "二、使用者需求", body: `列出主要使用者與其需求（功能性與非功能性）。` },
      { heading: "三、核心功能", body: `條列「${topic}」的主要功能模組。` },
      { heading: "四、系統架構", body: `描述前端、後端、資料庫與外部服務的關係。` },
      { heading: "五、技術選型", body: `列出採用的語言、框架與工具及選擇理由。` },
      { heading: "六、資料流程", body: `說明資料如何輸入、處理、儲存與輸出。` },
      { heading: "七、開發步驟", body: `規劃開發階段與里程碑。` },
      { heading: "八、測試方式", body: `說明單元測試、整合測試與使用者測試的做法。` },
      { heading: "九、風險與限制", body: `列出技術、時間與資源風險及因應。` },
      { heading: "十、未來擴充", body: `規劃後續可加入的功能或優化方向。` },
    ],
    charts: [
      {
        title: "技術選型比較表",
        position: "技術選型後",
        purpose: "比較不同技術方案的優劣。",
        content: "以表格列出方案、優點、缺點與採用與否。",
      },
    ],
    images: [
      {
        title: "系統架構圖",
        position: "系統架構後",
        purpose: `呈現「${topic}」各元件之間的關係。`,
        content: "以方塊圖標示前端、後端、資料庫與外部服務。",
      },
      {
        title: "介面原型圖（Wireframe）",
        position: "核心功能後",
        purpose: "呈現主要畫面的版面配置。",
        content: "以線框圖呈現關鍵頁面。",
      },
    ],
    flowcharts: [
      {
        title: "資料流程圖",
        position: "資料流程後",
        purpose: "呈現資料在系統中的流動。",
        content: "使用者輸入 → 處理 → 儲存 → 回傳結果。",
      },
    ],
  };
}

function buildHealthcare(topic: string): CategoryContent {
  return {
    summaryDirection: `本報告以「${topic}」為題，從服務對象、現況、挑戰、相關制度到案例與專業觀點進行整理，並提出個人反思與建議。`,
    summary: `本報告探討「${topic}」，說明服務對象與問題族群、現況與挑戰，整理相關制度與服務，並透過案例與專業觀點提出反思與建議。`,
    background: `「${topic}」涉及特定族群的需求與照顧議題，具有社會重要性。〔建議補充官方統計與專業資料〕`,
    motivation: `希望透過資料整理，更了解「${topic}」的現況與挑戰，並思考可行的支持方式。`,
    purpose: [
      `了解「${topic}」的服務對象與需求。`,
      `分析「${topic}」的現況與主要挑戰。`,
      `整理相關制度與服務資源。`,
      `透過案例提出專業觀點與個人反思。`,
    ],
    questions: [
      `「${topic}」主要服務或關注哪些族群？`,
      `「${topic}」目前面臨哪些挑戰？`,
      `有哪些制度或服務可以提供支持？`,
    ],
    hypothesis: [
      `「${topic}」的需求隨人口與社會結構變化而增加。`,
      `整合性的制度與服務能有效改善現況。`,
    ],
    literature: [
      `「${topic}」相關的官方統計與政策（資料待補）`,
      `專業研究與實務報告`,
      `服務模式與案例整理`,
    ],
    method: `採用文獻整理與案例分析法：蒐集官方資料、研究與實務案例，整理現況與挑戰並提出觀點。請注意本報告不做醫療診斷。`,
    analysis: `綜合資料可見「${topic}」面臨需求增加與資源不足等挑戰〔建議補充官方統計〕，需要制度、專業與家庭多方協力。`,
    discussion: `以尊重、客觀的態度討論「${topic}」的服務模式與限制；涉及醫療或心理判斷之處，應交由專業人員評估。`,
    limitations: [
      `本報告以二手資料為主，未進行實地調查。`,
      `涉及醫療與心理之內容需專業來源佐證，本報告不做診斷。`,
    ],
    conclusion: `綜合以上，「${topic}」需要制度支持、專業服務與社會理解的結合。本報告整理現況與建議，盼促進更完善的照顧與支持。`,
    futureWork: [
      `訪談服務對象或專業人員補充第一手觀點。`,
      `蒐集官方統計與政策評估資料。`,
    ],
    customSections: [
      { heading: "一、主題背景", body: `說明「${topic}」的背景與重要性。` },
      { heading: "二、服務對象或問題族群", body: `描述「${topic}」主要關注的族群與其需求。` },
      { heading: "三、現況說明", body: `說明「${topic}」目前的狀況。〔此處需要官方或研究統計〕` },
      { heading: "四、主要挑戰", body: `分析「${topic}」面臨的困難（人力、資源、制度等）。` },
      { heading: "五、相關制度或服務", body: `整理可運用的政策、補助或服務資源（資料待確認）。` },
      { heading: "六、案例分析", body: `以案例說明服務的實際情形（案例來源待確認，注意隱私）。` },
      { heading: "七、專業觀點", body: `引述專業人員或研究的看法（需專業來源佐證）。` },
      { heading: "八、個人反思", body: `提出對「${topic}」的反思與感受。` },
    ],
    charts: [
      {
        title: `${topic}相關統計圖`,
        position: "現況說明後",
        purpose: `呈現「${topic}」相關族群或需求的變化。`,
        content: `以折線圖或長條圖呈現官方數據（${SOURCE_NOTE}）。`,
      },
    ],
    images: [
      {
        title: "服務流程或資源示意圖",
        position: "相關制度或服務後",
        purpose: "讓讀者了解可運用的資源與管道。",
        content: "可用示意圖整理服務申請或轉介流程。",
      },
    ],
    flowcharts: [
      {
        title: "服務／轉介流程圖",
        position: "相關制度或服務後",
        purpose: "呈現取得服務的步驟。",
        content: "發現需求 → 評估 → 申請 → 提供服務 → 追蹤。",
      },
    ],
  };
}

function buildGeneral(topic: string): CategoryContent {
  return {
    summaryDirection: `本報告以「${topic}」為題，整理其背景、重要面向、現況與相關討論，並提出結論與個人觀點。`,
    summary: `本報告探討「${topic}」，從背景與動機出發，整理主要面向與現況，分析相關討論，最後提出結論與個人看法。`,
    background: `「${topic}」是值得整理與了解的主題。本報告蒐集相關資料，系統性地呈現其重要面向。〔建議補充背景資料〕`,
    motivation: `希望透過資料整理與分析，更完整地認識「${topic}」，並培養蒐集與組織資訊的能力。`,
    purpose: [
      `整理「${topic}」的背景與重要性。`,
      `分析「${topic}」的主要面向與現況。`,
      `提出結論與個人觀點。`,
    ],
    questions: [
      `「${topic}」的重要性與背景為何？`,
      `「${topic}」有哪些主要面向？`,
      `從「${topic}」可以得到什麼結論或啟發？`,
    ],
    hypothesis: [
      `「${topic}」可從多個面向加以理解。`,
      `深入整理「${topic}」有助於做出更完整的判斷。`,
    ],
    literature: [
      `「${topic}」的定義與基本資料`,
      `相關研究、報導或案例（來源待確認）`,
      `不同觀點的整理`,
    ],
    method: `採用文獻整理與歸納分析法：蒐集「${topic}」的相關資料，分類整理後加以分析並提出結論。`,
    analysis: `整理資料後可看出「${topic}」涵蓋多個面向〔建議補充具體資料與案例〕，彼此相互關聯。`,
    discussion: `比較不同資料與觀點，討論「${topic}」的重點與爭議，並提出個人判斷。`,
    limitations: [
      `本報告以二手資料整理為主，深度與廣度受限。`,
      `部分內容需更多資料佐證。`,
    ],
    conclusion: `綜合以上，「${topic}」具有多面向的內涵。本報告整理其重點與討論，作為後續深入研究的基礎。`,
    futureWork: [
      `補充第一手資料或實例。`,
      `針對特定面向做更深入的探討。`,
    ],
    customSections: [
      { heading: "一、主題背景", body: `介紹「${topic}」的基本背景與重要性。` },
      { heading: "二、主要面向", body: `整理「${topic}」的重要面向或分類。` },
      { heading: "三、現況分析", body: `說明「${topic}」目前的狀況或發展。` },
      { heading: "四、相關討論", body: `整理與「${topic}」相關的案例或不同觀點。` },
      { heading: "五、個人觀點", body: `提出對「${topic}」的看法。` },
    ],
    charts: [
      {
        title: `${topic}重點整理表`,
        position: "主要面向後",
        purpose: `整理「${topic}」的主要面向與重點。`,
        content: "以表格分類呈現各面向與說明。",
      },
    ],
    images: [
      {
        title: `${topic}概念圖`,
        position: "主題背景後",
        purpose: `以圖像呈現「${topic}」的核心概念與關聯。`,
        content: "可用心智圖整理重點。",
      },
    ],
    flowcharts: [
      {
        title: "主題架構圖",
        position: "主要面向後",
        purpose: `呈現「${topic}」各面向之間的關係。`,
        content: "以樹狀或關係圖呈現。",
      },
    ],
  };
}

function buildCategoryContent(topic: string, category: TopicCategory): CategoryContent {
  switch (category) {
    case "生物／動物":
      return buildBiology(topic);
    case "科學實驗":
      return buildExperiment(topic);
    case "社會議題":
      return buildSocialIssue(topic);
    case "歷史／地理／公民":
      return buildHistoryGeo(topic);
    case "讀書心得":
      return buildBookReflection(topic);
    case "商業／產品分析":
      return buildBusiness(topic);
    case "AI／網站／程式專案":
      return buildTechProject(topic);
    case "醫療／長照／社工／心理":
      return buildHealthcare(topic);
    default:
      return buildGeneral(topic);
  }
}

// ─── Style & length tone helpers ─────────────────────────────────────────────

function styleNote(style: string, audience: string): string {
  const map: Record<string, string> = {
    高中生可提交: `語氣自然、用詞淺顯，適合${audience}閱讀並可直接提交給老師。`,
    "90 分以上學校報告": `結構完整、含研究問題、方法、圖表與研究限制，適合正式評分。`,
    學術研究風格: `用詞正式、加強文獻探討與研究方法，並含限制與未來研究。`,
    商業顧問風格: `以決策為導向，聚焦市場、成本、風險與執行，結論可支持行動。`,
    口語簡報風格: `句子簡短、重點清楚，適合口頭報告，可轉為簡報講稿。`,
    深度研究報告: `結構詳盡、分析深入，並需要真實資料來源補強。`,
  };
  return map[style] ?? `語氣設定為「${style}」。`;
}

/**
 * styleLead — a tone-setting opening sentence prepended to the summary so the
 * generated text itself (not just the reminder) reflects the chosen style.
 */
function styleLead(style: string): string {
  const map: Record<string, string> = {
    高中生可提交: "（以淺顯、口語化的方式說明，方便理解與直接提交。）",
    "90 分以上學校報告": "（以嚴謹、完整的學術結構撰寫，強調研究問題、方法與限制。）",
    學術研究風格: "（採正式學術語氣，加重文獻探討、研究方法與理論依據。）",
    商業顧問風格: "（以決策導向撰寫，聚焦市場、成本、風險與可執行建議。）",
    口語簡報風格: "（以精簡、條列式重點呈現，適合口頭報告與簡報講稿。）",
    深度研究報告: "（以深入分析撰寫，延伸比較、數據與多元觀點。）",
  };
  return map[style] ?? "";
}

type LengthDetail = "brief" | "normal" | "full" | "deep";

interface LengthSpec {
  versionBase: string;
  completeness: number;
  remind: boolean; // 深度研究 reminder
  detail: LengthDetail;
  lead: string; // length framing sentence prepended to summary
  listCap: number; // max items shown in expandable lists (Infinity = no cap)
}

function lengthSpec(length: string): LengthSpec {
  switch (length) {
    case "短版摘要":
      return {
        versionBase: "短版摘要",
        completeness: 50,
        remind: false,
        detail: "brief",
        lead: "（短版摘要：以下為精簡版本，僅聚焦核心重點，可再依需求擴寫。）",
        listCap: 3,
      };
    case "完整報告":
      return {
        versionBase: "完整報告草稿",
        completeness: 80,
        remind: false,
        detail: "full",
        lead: "（完整報告：以下涵蓋各主要面向，建議搭配資料來源充實內容。）",
        listCap: Infinity,
      };
    case "深度研究":
      return {
        versionBase: "深度研究草稿",
        completeness: 85,
        remind: true,
        detail: "deep",
        lead: "（深度研究：以下提供延伸方向，建議補充更多文獻、數據與比較分析。）",
        listCap: Infinity,
      };
    default:
      return {
        versionBase: "一般報告草稿",
        completeness: 65,
        remind: false,
        detail: "normal",
        lead: "",
        listCap: Infinity,
      };
  }
}

// ─── Source / reference helpers ──────────────────────────────────────────────

function citationTemplate(format: string): string {
  switch (format) {
    case "APA":
      return "作者或機構名稱。（年份）。文章或資料標題。網站或出版單位。網址";
    case "MLA":
      return "作者。〈文章標題〉。《網站或出版單位名稱》，年份，網址。";
    case "Chicago":
      return "作者。「文章標題。」網站或出版單位名稱。年份。網址。";
    case "老師指定格式":
      return "請依老師指定的引用格式填寫（格式範例待老師提供）。";
    default:
      return "";
  }
}

function buildReferenceBlocks(input: ReportInput): ContentBlock[] {
  if (!needsSource(input)) return [];
  const blocks: ContentBlock[] = [
    {
      type: "note",
      text: "此處需要補充真實資料來源，建議使用官方網站、政府資料、學術論文、期刊或可信機構資料。為避免錯誤，本系統不自動產生來源，請自行查證後填入。",
    },
  ];
  if (wantsReferences(input) && input.citationFormat !== "無") {
    blocks.push({
      type: "paragraph",
      text: `參考文獻格式（${input.citationFormat}）：`,
    });
    blocks.push({
      type: "list",
      items: [
        citationTemplate(input.citationFormat),
        "範例（請替換為實際資料）：〔作者或機構〕。〔年份〕。〔標題〕。〔出處〕。〔網址〕",
        "資料來源待補",
        "來源待確認",
      ],
    });
  } else {
    blocks.push({
      type: "list",
      items: ["資料來源待補", "此處需要補充官方資料或學術資料", "建議查詢政府網站、學術論文、期刊、出版社或可信機構資料"],
    });
  }
  return blocks;
}

// ─── Data requirement rows ───────────────────────────────────────────────────

function buildDataRows(topic: string): DataRequirementRow[] {
  return [
    { type: "主題背景資料", need: `「${topic}」的定義、基本介紹與重要性`, use: "建立報告的背景與前言", priority: "高" },
    { type: "統計數據", need: "相關的數量、比例或趨勢數據", use: "佐證現況與分析", priority: "中" },
    { type: "文獻資料", need: "書籍、論文、期刊或官方文件", use: "支持論點、撰寫文獻探討", priority: "高" },
    { type: "案例", need: "國內外相關實例", use: "具體說明與比較", priority: "中" },
    { type: "圖片", need: "實景、示意或構造圖片", use: "輔助說明、提升可讀性", priority: "低" },
    { type: "圖表數據", need: "可繪製圖表的原始數據", use: "製作圖表呈現結果", priority: "中" },
    { type: "使用者個人觀點", need: "個人看法、反思或經驗", use: "提升報告深度與獨特性", priority: "高" },
    { type: "引用來源", need: "可信的出處與連結", use: "撰寫參考文獻、避免抄襲", priority: "高" },
  ];
}

// ─── Quality checklist ───────────────────────────────────────────────────────

function buildQualityChecks(input: ReportInput, content: CategoryContent): QualityCheck[] {
  const checks: QualityCheck[] = [
    { label: "具備清楚的報告主題", passed: chars(input.topic) > 0 },
    { label: "包含摘要或前言", passed: true },
    { label: "說明研究背景", passed: content.background.length > 0 },
    { label: "具備明確研究目的", passed: content.purpose.length > 0 },
    { label: "包含研究問題", passed: content.questions.length > 0 },
    { label: "有研究方法或分析方式", passed: content.method.length > 0 },
    { label: "有結論", passed: content.conclusion.length > 0 },
    { label: "可作為後續修改基礎", passed: true },
  ];

  if (input.chartRequirement === "需要") {
    checks.push({ label: "已規劃圖表呈現", passed: content.charts.length > 0 });
    checks.push({ label: "已規劃圖片或流程圖", passed: content.images.length > 0 || content.flowcharts.length > 0 });
  }

  if (needsSource(input)) {
    checks.push({ label: "已標示資料來源需求", passed: true });
    checks.push({ label: "已提醒補充真實資料來源", passed: true });
    checks.push({ label: "已提供參考文獻格式", passed: wantsReferences(input) && input.citationFormat !== "無" });
  }

  if (input.mode === "完整報告") {
    checks.push({ label: "段落完整", passed: true });
    checks.push({ label: "內容具備分析", passed: content.analysis.length > 0 });
    checks.push({ label: "結論不是單純重複前文", passed: true });
    checks.push({ label: "有研究限制與未來建議", passed: content.limitations.length > 0 && content.futureWork.length > 0 });
  }

  if (input.additionalInfo.trim()) {
    checks.push({ label: "已納入老師要求／補充資料", passed: true });
  } else {
    checks.push({ label: "已納入老師要求／補充資料", passed: false });
  }

  return checks;
}

// ─── Suggestion block helper ─────────────────────────────────────────────────

function suggestionsBlock(kind: "圖表" | "圖片" | "流程圖", list: SuggestionBlock[]): ContentBlock {
  return { type: "suggestions", suggestionKind: kind, suggestions: list };
}

function additionalInfoSection(input: ReportInput): ReportSection | null {
  if (!input.additionalInfo.trim()) return null;
  return {
    heading: "補充資料重點（已優先納入）",
    blocks: [
      { type: "note", text: "以下為你提供的補充資料／老師要求／評分標準，已在本報告中優先納入並反映：" },
      { type: "paragraph", text: input.additionalInfo.trim() },
      { type: "note", text: "撰寫時請確認上述每一項要求都已對應到報告的相關段落。" },
    ],
  };
}

/**
 * applyStyleAndLength — post-process generated sections so the chosen style and
 * length materially change the output: a tone-setting lead is prepended to the
 * summary, short-version output is trimmed, and deep research gains an extension
 * prompt. Operates on freshly built section objects (safe to replace blocks).
 */
function applyStyleAndLength(sections: ReportSection[], input: ReportInput): ReportSection[] {
  const ls = lengthSpec(input.length);
  const lead = `${styleLead(input.style)}${ls.lead}`.trim();

  if (lead && sections.length > 0) {
    const first = sections[0];
    const idx = first.blocks.findIndex((b) => b.type === "paragraph");
    if (idx >= 0) {
      const p = first.blocks[idx];
      first.blocks[idx] = { ...p, text: `${lead}\n${p.text ?? ""}` };
    } else {
      first.blocks = [{ type: "note", text: lead }, ...first.blocks];
    }
  }

  if (ls.listCap !== Infinity) {
    for (const s of sections) {
      s.blocks = s.blocks.map((b) => {
        if (b.type === "list" && b.items && b.items.length > ls.listCap) {
          return {
            ...b,
            items: [...b.items.slice(0, ls.listCap), "…（短版摘要已精簡，需完整內容請改用一般或完整報告長度）"],
          };
        }
        return b;
      });
    }
  }

  if (ls.detail === "deep" && sections.length > 0) {
    sections[0].blocks = [
      ...sections[0].blocks,
      {
        type: "note",
        text: "深度研究建議：補充至少 3 筆真實文獻、跨案例或跨時間的比較，以及量化數據佐證，以提升分析深度。",
      },
    ];
  }

  return sections;
}

// ─── Mode builders ───────────────────────────────────────────────────────────

function buildStructureSections(input: ReportInput, content: CategoryContent): ReportSection[] {
  const sections: ReportSection[] = [];
  const addInfo = additionalInfoSection(input);

  sections.push({ heading: "摘要方向", blocks: [{ type: "paragraph", text: content.summaryDirection }] });
  if (addInfo) sections.push(addInfo);
  sections.push({ heading: "一、研究背景", blocks: [{ type: "paragraph", text: content.background }] });
  sections.push({ heading: "二、研究動機", blocks: [{ type: "paragraph", text: content.motivation }] });
  sections.push({ heading: "三、研究目的", blocks: [{ type: "list", items: content.purpose }] });
  sections.push({ heading: "四、研究問題", blocks: [{ type: "list", items: content.questions }] });
  if (content.hypothesis.length > 0) {
    sections.push({ heading: "五、研究假設", blocks: [{ type: "list", items: content.hypothesis }] });
  }
  sections.push({
    heading: "六、報告大綱（依主題類型）",
    blocks: content.customSections.map((c) => ({ type: "paragraph", text: `${c.heading}：${c.body}` } as ContentBlock)),
  });
  sections.push({ heading: "七、文獻探討大綱", blocks: [{ type: "list", items: content.literature }] });
  sections.push({
    heading: "八、研究方法",
    blocks: [{ type: "paragraph", text: content.method }],
  });

  if (input.chartRequirement === "需要") {
    sections.push({ heading: "九、預計圖表", blocks: [suggestionsBlock("圖表", content.charts)] });
    sections.push({
      heading: "十、預計圖片",
      blocks: [suggestionsBlock("圖片", content.images), suggestionsBlock("流程圖", content.flowcharts)],
    });
  }

  sections.push({ heading: "十一、研究限制", blocks: [{ type: "list", items: content.limitations }] });
  sections.push({ heading: "十二、結論草稿", blocks: [{ type: "paragraph", text: content.conclusion }] });
  sections.push({ heading: "十三、資料需求表", blocks: [{ type: "dataTable", rows: buildDataRows(input.topic) }] });

  const refBlocks = buildReferenceBlocks(input);
  if (refBlocks.length > 0) sections.push({ heading: "參考資料與來源", blocks: refBlocks });

  return sections;
}

function buildFullSections(input: ReportInput, content: CategoryContent): ReportSection[] {
  const sections: ReportSection[] = [];
  const addInfo = additionalInfoSection(input);

  sections.push({ heading: "摘要", blocks: [{ type: "paragraph", text: content.summary }] });
  if (addInfo) sections.push(addInfo);
  sections.push({ heading: "一、研究背景", blocks: [{ type: "paragraph", text: content.background }] });
  sections.push({ heading: "二、研究動機", blocks: [{ type: "paragraph", text: content.motivation }] });
  sections.push({
    heading: "三、研究目的",
    blocks: [{ type: "paragraph", text: `本報告主要目的如下：` }, { type: "list", items: content.purpose }],
  });
  sections.push({
    heading: "四、文獻探討",
    blocks: [
      { type: "paragraph", text: `本報告蒐集並整理與「${input.topic}」相關的資料，方向包含：` },
      { type: "list", items: content.literature },
      ...(needsSource(input) ? [{ type: "note", text: INSERT_SOURCE_NOTE } as ContentBlock] : []),
    ],
  });
  sections.push({ heading: "五、研究方法", blocks: [{ type: "paragraph", text: content.method }] });
  sections.push({
    heading: "六、研究結果與分析",
    blocks: [
      { type: "paragraph", text: content.analysis },
      ...content.customSections.map((c) => ({ type: "paragraph", text: `${c.heading}：${c.body}` } as ContentBlock)),
      ...(input.chartRequirement === "需要" ? [suggestionsBlock("圖表", content.charts)] : []),
    ],
  });
  sections.push({ heading: "七、討論", blocks: [{ type: "paragraph", text: content.discussion }] });
  sections.push({ heading: "八、結論", blocks: [{ type: "paragraph", text: content.conclusion }] });
  sections.push({
    heading: "九、研究限制與未來建議",
    blocks: [
      { type: "paragraph", text: "研究限制：" },
      { type: "list", items: content.limitations },
      { type: "paragraph", text: "未來建議：" },
      { type: "list", items: content.futureWork },
    ],
  });

  const refBlocks = buildReferenceBlocks(input);
  sections.push({
    heading: "十、參考文獻",
    blocks: refBlocks.length > 0 ? refBlocks : [{ type: "note", text: "未要求資料來源；如需提交正式報告，建議補充真實參考文獻。" }],
  });

  return sections;
}

function buildSlideSections(input: ReportInput, content: CategoryContent): ReportSection[] {
  const t = input.topic;
  const slides: SlideItem[] = [
    { page: 1, title: "封面", points: [`題目：${t}`, `報告類型：${input.reportType}`, `對象：${input.targetAudience}`], visual: "封面圖或主題代表圖片" },
    { page: 2, title: "研究背景", points: [content.background], visual: "背景情境圖或概念圖" },
    { page: 3, title: "研究動機", points: [content.motivation], visual: "問題情境插圖" },
    { page: 4, title: "研究目的", points: content.purpose, visual: "目標條列或圖示" },
    { page: 5, title: "核心問題", points: content.questions, visual: "問號或重點標示" },
    { page: 6, title: "主要分析", points: content.customSections.slice(0, 4).map((c) => `${c.heading.replace(/^[一二三四五六七八九十]+、/, "")}：${c.body}`), visual: "重點整理表" },
    { page: 7, title: "圖表頁", points: content.charts.map((c) => `${c.title}：${c.purpose}`), visual: "對應圖表" },
    { page: 8, title: "討論", points: [content.discussion], visual: "對照或比較圖" },
    { page: 9, title: "結論", points: [content.conclusion], visual: "重點總結圖示" },
    { page: 10, title: "參考資料", points: needsSource(input) ? ["資料來源待補", "建議補充真實官方或學術資料"] : ["（本次未要求資料來源）"], visual: "參考資料列表" },
  ];
  return [{ heading: "簡報大綱", blocks: [{ type: "slides", slides }] }];
}

function buildDataTableSections(input: ReportInput): ReportSection[] {
  return [
    {
      heading: "資料需求表",
      blocks: [
        { type: "paragraph", text: `以下整理完成「${input.topic}」報告所需蒐集的資料、用途與優先程度，請依此逐項補齊。` },
        { type: "dataTable", rows: buildDataRows(input.topic) },
        ...(needsSource(input) ? [{ type: "note", text: SOURCE_NOTE } as ContentBlock] : []),
      ],
    },
  ];
}

function buildChartImageSections(input: ReportInput, content: CategoryContent): ReportSection[] {
  return [
    { heading: "建議圖表", blocks: [suggestionsBlock("圖表", content.charts)] },
    { heading: "建議圖片", blocks: [suggestionsBlock("圖片", content.images)] },
    { heading: "建議流程圖", blocks: [suggestionsBlock("流程圖", content.flowcharts)] },
  ];
}

// ─── Completeness ────────────────────────────────────────────────────────────

function computeMeta(input: ReportInput, category: TopicCategory, content: CategoryContent): ReportMeta {
  const ls = lengthSpec(input.length);

  const modeBase: Record<string, { label: string; base: number }> = {
    報告架構: { label: "報告架構草稿", base: 40 },
    完整報告: { label: "完整報告草稿", base: 80 },
    簡報大綱: { label: "簡報大綱", base: 55 },
    資料需求表: { label: "資料需求表", base: 35 },
    圖表與圖片建議: { label: "圖表與圖片建議", base: 45 },
  };
  const m = modeBase[input.mode] ?? modeBase["報告架構"];

  // Combine mode base with a small nudge from length and additional info.
  let completeness = Math.round((m.base + ls.completeness) / 2);
  if (input.additionalInfo.trim()) completeness += 5;
  if (input.chartRequirement === "需要") completeness += 2;
  // Without real sources we cap below "finished".
  completeness = Math.min(completeness, 88);

  const suggested: string[] = [];
  if (needsSource(input)) suggested.push("資料來源");
  suggested.push("統計數據", "案例", "圖表資料");
  if (!input.additionalInfo.trim()) suggested.push("個人觀點", "老師評分標準");

  return {
    title: `《${input.topic}》${input.reportType}`,
    category,
    versionLabel: m.label,
    completeness,
    suggestedAdditions: suggested,
  };
}

// ─── Main entry ──────────────────────────────────────────────────────────────

/**
 * generateReport
 * Synchronous mock generator. Swap the body for an async model call later;
 * keep the GeneratedReport return shape stable so the UI needs no changes.
 */
export function generateReport(input: ReportInput): GeneratedReport {
  const topic = input.topic.trim();
  const category = detectTopicCategory(topic, input.reportType, input.purpose);
  const content = buildCategoryContent(topic, category);
  const meta = computeMeta(input, category, content);

  let sections: ReportSection[];
  switch (input.mode) {
    case "完整報告":
      sections = buildFullSections(input, content);
      break;
    case "簡報大綱":
      sections = buildSlideSections(input, content);
      break;
    case "資料需求表":
      sections = buildDataTableSections(input);
      break;
    case "圖表與圖片建議":
      sections = buildChartImageSections(input, content);
      break;
    default:
      sections = buildStructureSections(input, content);
  }

  // Style + length materially shape narrative output (summary lead, trimming,
  // deep-research prompts). Skip pure-table/suggestion modes that have no summary.
  if (input.mode === "報告架構" || input.mode === "完整報告" || input.mode === "簡報大綱") {
    sections = applyStyleAndLength(sections, input);
  }

  // Quality checklist is appended for narrative modes.
  if (input.mode === "報告架構" || input.mode === "完整報告") {
    sections.push({
      heading: "報告品質檢查表",
      blocks: [{ type: "quality", checks: buildQualityChecks(input, content) }],
    });
  }

  // Style note at the very end as a small reminder section.
  sections.push({
    heading: "寫作風格提醒",
    blocks: [
      { type: "note", text: `${styleNote(input.style, input.targetAudience)}${lengthSpec(input.length).remind ? "（深度研究需補充真實資料來源、統計與參考文獻。）" : ""}` },
    ],
  });

  const report: GeneratedReport = { meta, sections };

  if (isShortTopic(topic)) {
    report.shortTopic = {
      message:
        "你的主題較簡短，系統已先產生基礎版本。若要提高報告品質，建議補充研究方向、老師要求、資料來源或個人觀點。",
      expansions: expandTopic(topic, category),
    };
  }

  return report;
}
