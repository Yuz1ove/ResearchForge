from __future__ import annotations

import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    LongTable,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
OUTPUT = REPO / "output" / "pdf" / "ResearchForge-report-intelligence-upgrade-QA-20260813.pdf"
FONT_PATH = Path("/System/Library/Fonts/STHeiti Medium.ttc")


INK = colors.HexColor("#203334")
MUTED = colors.HexColor("#5F7272")
TEAL = colors.HexColor("#0F7775")
LIGHT_TEAL = colors.HexColor("#E6F3F1")
NAVY = colors.HexColor("#183A55")
AMBER = colors.HexColor("#B46B18")
LIGHT_AMBER = colors.HexColor("#FFF3DE")
RED = colors.HexColor("#A33A32")
LIGHT_RED = colors.HexColor("#FBEAE7")
GRID = colors.HexColor("#CAD8D7")
PAPER = colors.HexColor("#F8FBFA")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("RFHeiti", str(FONT_PATH), subfontIndex=0))
    pdfmetrics.registerFontFamily(
        "RFHeiti",
        normal="RFHeiti",
        bold="RFHeiti",
        italic="RFHeiti",
        boldItalic="RFHeiti",
    )


register_fonts()


styles = getSampleStyleSheet()
TITLE = ParagraphStyle(
    "RFTitle",
    parent=styles["Title"],
    fontName="RFHeiti",
    fontSize=25,
    leading=34,
    textColor=NAVY,
    alignment=TA_LEFT,
    spaceAfter=8 * mm,
)
SUBTITLE = ParagraphStyle(
    "RFSubtitle",
    fontName="RFHeiti",
    fontSize=11,
    leading=18,
    textColor=MUTED,
    spaceAfter=5 * mm,
)
H1 = ParagraphStyle(
    "RFH1",
    fontName="RFHeiti",
    fontSize=17,
    leading=23,
    textColor=NAVY,
    spaceBefore=4 * mm,
    spaceAfter=3.5 * mm,
    keepWithNext=True,
)
H2 = ParagraphStyle(
    "RFH2",
    fontName="RFHeiti",
    fontSize=12.5,
    leading=18,
    textColor=TEAL,
    spaceBefore=3 * mm,
    spaceAfter=2 * mm,
    keepWithNext=True,
)
BODY = ParagraphStyle(
    "RFBody",
    fontName="RFHeiti",
    fontSize=9.5,
    leading=15.5,
    textColor=INK,
    spaceAfter=2.4 * mm,
)
SMALL = ParagraphStyle(
    "RFSmall",
    fontName="RFHeiti",
    fontSize=8.2,
    leading=12.5,
    textColor=INK,
)
TABLE_HEADER = ParagraphStyle(
    "RFTableHeader",
    fontName="RFHeiti",
    fontSize=8.2,
    leading=11.5,
    textColor=colors.white,
    alignment=TA_CENTER,
)
TABLE_CELL = ParagraphStyle(
    "RFTableCell",
    fontName="RFHeiti",
    fontSize=7.8,
    leading=11.5,
    textColor=INK,
)
CALLOUT = ParagraphStyle(
    "RFCallout",
    fontName="RFHeiti",
    fontSize=10,
    leading=16,
    textColor=INK,
)
MONOISH = ParagraphStyle(
    "RFMono",
    fontName="RFHeiti",
    fontSize=7.4,
    leading=10.8,
    textColor=NAVY,
)


def p(text: str, style: ParagraphStyle = BODY) -> Paragraph:
    return Paragraph(text.replace("&", "&amp;"), style)


def bullet(text: str) -> Paragraph:
    style = ParagraphStyle(
        "RFBullet",
        parent=BODY,
        leftIndent=5 * mm,
        firstLineIndent=-3 * mm,
        bulletIndent=0,
        spaceAfter=1.4 * mm,
    )
    return Paragraph(f"- {text}".replace("&", "&amp;"), style)


def callout(label: str, text: str, tone: str = "teal") -> Table:
    palette = {
        "teal": (LIGHT_TEAL, TEAL),
        "amber": (LIGHT_AMBER, AMBER),
        "red": (LIGHT_RED, RED),
    }
    background, accent = palette[tone]
    table = Table(
        [[p(f"<b>{label}</b><br/>{text}", CALLOUT)]],
        colWidths=[166 * mm],
        hAlign="LEFT",
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("BOX", (0, 0), (-1, -1), 0.8, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
    ]))
    return table


def data_table(headers: list[str], rows: list[list[str]], widths: list[float]) -> LongTable:
    data = [[p(item, TABLE_HEADER) for item in headers]]
    for row in rows:
        data.append([p(str(item), TABLE_CELL) for item in row])
    table = LongTable(data, colWidths=[value * mm for value in widths], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.35, GRID),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PAPER]),
        ("LEFTPADDING", (0, 0), (-1, -1), 2 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
    ]))
    return table


def header_footer(canvas, doc) -> None:
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(GRID)
    canvas.setLineWidth(0.4)
    canvas.line(22 * mm, height - 14 * mm, width - 22 * mm, height - 14 * mm)
    canvas.setFont("RFHeiti", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(22 * mm, height - 10.5 * mm, "ResearchForge - Report Intelligence Upgrade QA")
    canvas.drawRightString(width - 22 * mm, 10.5 * mm, f"{doc.page}")
    canvas.drawString(22 * mm, 10.5 * mm, "2026-08-13 | PARTIAL_REPORT_INTELLIGENCE_UPGRADE")
    canvas.restoreState()


class QaDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=22 * mm,
            rightMargin=22 * mm,
            topMargin=20 * mm,
            bottomMargin=18 * mm,
            title="ResearchForge 研究報告品質全面升級 QA",
            author="ResearchForge QA",
            subject="Report intelligence upgrade verification",
        )
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates([PageTemplate(id="qa", frames=[frame], onPage=header_footer)])


def build_story() -> list:
    regression = json.loads((HERE / "regression-matrix.json").read_text(encoding="utf-8"))
    tests = json.loads((HERE / "qa-test-results.json").read_text(encoding="utf-8"))
    live = json.loads((HERE / "live-acceptance-status.json").read_text(encoding="utf-8"))
    story: list = []

    story += [
        Spacer(1, 18 * mm),
        p("ResearchForge", ParagraphStyle("Kicker", parent=H2, fontSize=13, textColor=TEAL)),
        p("研究報告品質全面升級", TITLE),
        p("Report Intelligence Upgrade - QA and Acceptance Record", SUBTITLE),
        HRFlowable(width="100%", thickness=1.2, color=TEAL, spaceAfter=8 * mm),
        callout(
            "Executive verdict",
            "PARTIAL_REPORT_INTELLIGENCE_UPGRADE。核心 report-intelligence vertical slice 已完成並通過 configured regression；但 project_sources/ 與 13 份指定 DOCX/PDF 缺失，七題 post-slice live 全鏈驗收為 0/7，因此不能宣稱完整 PASS。",
            "amber",
        ),
        Spacer(1, 8 * mm),
        data_table(
            ["驗證面", "結果", "解讀"],
            [
                ["Configured suites", "828 / 828 PASS", "Report Factory 395；API Server 433"],
                ["精確具名驗收", "28 / 28 present", "核心具名子集 123 / 123 PASS"],
                ["A-G benchmark", "7 / 7 PASS", "Provider-free deterministic contracts；0 regression"],
                ["Live formal cases", "0 / 7 complete", "不能以合成 benchmark 或 prior artifacts 代替"],
                ["Latest actual model run", "BLOCKED", "Sentence claim/citation entailment 與 fallback gates 正確阻擋 export"],
            ],
            [43, 37, 86],
        ),
        Spacer(1, 12 * mm),
        p("文件版本：2026-08-13", SMALL),
        p("驗證原則：功能、資料與輸出必須分開證明；測試檔存在不等於 live product acceptance。", SMALL),
        PageBreak(),
    ]

    story += [p("1. 問題、根因與升級邊界", H1)]
    for item in [
        "舊流程的 Raw abstract、Evidence Card、section draft 與 writer 責任邊界不夠完整，容易形成摘要改寫、來源拼接與引用堆疊。",
        "Facts、claim graph、visual/export 已有良好基礎，但存取層級、全文語義段落、摘要/全文衝突、異質性、矛盾與統計解讀未集中成一份 canonical intelligence model。",
        "數值能被抽出或畫圖，不代表已正確解釋；OR、相關、CI、p 值、橫斷研究與混雜因素需要獨立 deterministic rules。",
        "既有品質檢查分散於 citation/export/render gates，缺少十面向總評、失敗位置、retry stage 與 retry cap。",
    ]:
        story.append(bullet(item))
    story += [
        Spacer(1, 3 * mm),
        callout(
            "本輪邊界",
            "完成安全的 vertical slice，接入 canonical plan、writer、formal document 與 export integrity；沒有把缺少的 live 七題、未接通的 Image2 或不存在的 project_sources 包裝成已完成。",
            "teal",
        ),
        Spacer(1, 5 * mm),
        p("2. 新 canonical pipeline", H1),
        data_table(
            ["階段", "主要輸出", "責任"],
            [
                ["Source resolution", "canonical source + access tier", "同來源去重、取得層級、failure truthfulness"],
                ["Evidence resolution", "semantic section + conflict ledger", "Results 優先；Discussion 不冒充直接結果"],
                ["Atomic Facts", "nullable traceable facts", "缺值保持 null；保留 source span/locator/verification"],
                ["Report intelligence", "knowledge, heterogeneity, stats, contradiction", "概念與研究差異先於文字生成"],
                ["Routing", "AudienceProfile + ReportArchetype", "控制深度、圖表、章節、最低證據條件"],
                ["Narrative", "teach-back + reconstruction", "writer 不接 raw abstracts；citation identity 後接回"],
                ["Verification", "claim/citation/number/editor audits", "逐 claim identity、錯誤來源、source echo 或 editor 未真正去重皆 fail closed"],
                ["Quality/export", "10 dimensions + retry/blockExport", "canonical Preview/Markdown/DOCX/PDF"],
            ],
            [34, 50, 82],
        ),
        PageBreak(),
    ]

    story += [p("3. 資料模型與核心行為", H1)]
    story += [p("3.1 Atomic Evidence Fact", H2)]
    story.append(p(
        "Schema 現在包含 sourceType、evidenceLevel、sourceAccessLevel、sectionType、studySetting、pValue、moderator、confounders、authorInterpretation、authorLimitations、extractionConfidence 與 verificationStatus；來源未提供的欄位維持 null。"
    ))
    story += [p("3.2 Full-text / abstract resolution", H2)]
    story.append(data_table(
        ["能力", "實作結果"],
        [
            ["六級存取", "complete full text、structured full text、verifiable excerpt、complete abstract、partial abstract、bibliographic only"],
            ["語義段落", "背景、問題、樣本、eligibility、design、exposure、outcome、measurement、statistics、results、sensitivity、discussion、mechanism、limitations、conclusion"],
            ["衝突", "保留 abstract/full-text conflict；優先 Results full text；confidence penalty 0.25"],
            ["Fail closed", "無 locator 數值不可 verified；extraction failure 不產生 ghost evidence"],
        ],
        [48, 118],
    ))
    story += [p("3.3 Knowledge, heterogeneity and contradiction", H2)]
    for item in [
        "Knowledge nodes 覆蓋 population、exposure、outcome、mediator、moderator、confounder、setting、method、direction、applicability 與 gap。",
        "Knowledge edges 保留 supporting/counter sources、directness、statistical relation vs author inference、causal eligibility 與 uncertainty。",
        "Comparability 僅允許 COMPARABLE、PARTIALLY_COMPARABLE、DIRECTION_ONLY、NOT_COMPARABLE；OR/RR/HR 不互相 pooling。",
        "TikTok、短影音、短影音成癮、一般社群媒體；LST、氣溫、熱舒適、UHI；GVI、canopy、NDVI、green coverage 維持概念隔離。",
        "Contradiction 保留反方向、null/mixed 結果、單一來源與替代解釋，不為了流暢隱藏反例。",
    ]:
        story.append(bullet(item))
    story += [PageBreak()]

    story += [p("4. 統計、視覺與讀者路由", H1)]
    story += [p("4.1 Statistical Interpretation Layer", H2)]
    story.append(data_table(
        ["家族", "核心保護"],
        [
            ["OR / RR / HR", "保留 ratio 與 null=1；OR 不改寫為風險增加百分比"],
            ["Correlation", "方向與關聯強度；明確禁止因果"],
            ["CI / p value / null", "CI crossing null 不宣稱穩定；p > .05 不等於沒有關係"],
            ["Mean / median / SD / IQR", "不同量表與計分方向不可直接比較"],
            ["Regression / standardized beta", "保留單位、模型與 adjustment status"],
            ["Mediation / interaction", "模型路徑不冒充已證明機制"],
            ["Model fit / non-significant", "解釋樣本內變異；不等於預測或因果有效"],
        ],
        [54, 112],
    ))
    story += [p("4.2 Visual semantics and Image2", H2)]
    for item in [
        "比例 -> proportion bar；OR/RR/HR + CI -> forest plot；correlation -> matrix；mediation/interaction -> path diagram。",
        "所有研究數字、軸、CI 與 label 由 structured facts deterministic 生成並有 datum provenance。",
        "Image2 prompt 若含研究數字、百分比、OR/RR/HR/CI 即不 truthful；目前沒有 live Image2 provider，使用 deterministic fallback。",
    ]:
        story.append(bullet(item))
    story += [p("4.3 Audience and archetype", H2)]
    story.append(data_table(
        ["Router", "支援", "不是只改字數"],
        [
            ["AudienceProfile", "一般、高中、大學、專業、決策", "術語、句長、統計、方法、圖表、引用、限制、建議、證據分級"],
            ["ReportArchetype", "綜述、比較、機制、實驗、技術、政策、市場、爭議、有限證據、證據地圖", "各自 blueprint、evidence/visual requirements、comparison method、conclusion form、minimum conditions"],
        ],
        [36, 50, 80],
    ))
    story += [PageBreak()]

    story += [p("5. Writer、editor、verifier 與 QualityGate", H1)]
    story += [p("5.1 Writer-safe contract", H2)]
    for item in [
        "Teach-back packet 去身分化，不含 sourceSpan、rawText、supportSpan、abstract 或 snippet values。",
        "Academic reconstruction 取得 normalized facts、claim graph、stat interpretations、heterogeneity、contradiction、audience/archetype 與 citation identity。",
        "實際 prompt sentinel tests 證明 RAW_ABSTRACT/RAW_SUPPORT_SPAN/RAW_NUMERIC_SENTENCE 不會進入 writer。",
    ]:
        story.append(bullet(item))
    story += [p("5.2 Whole-document editor", H2)]
    story.append(p(
        "Editor 可合併重複、修轉場、統一術語與順序，但不能改 citation identity/order、number、year、location、method、effect measure 或 evidence boundary；post-edit 再跑 sentence claim/citation entailment、source-echo 與 edit 前後重複度 checks。若 exact/near-duplicate burden 沒有下降，不得標為 applied。"
    ))
    story += [p("5.3 Ten-dimension ReportQualityGate", H2)]
    quality_rows = [
        ["Evidence integrity", "source/evidence/locator traceability", "evidence extraction"],
        ["Citation precision", "entailment + identity", "claim/citation mapping"],
        ["Synthesis", "source-order/stitching", "narrative planning"],
        ["Statistical correctness", "number facts + interpretation", "evidence extraction"],
        ["Coherence", "transition + repetition", "editor / narrative"],
        ["Visual effectiveness", "type + provenance + render", "visual router"],
        ["Directness honesty", "overclaim + sufficiency", "readiness/claim strength"],
        ["Contradiction", "material counterevidence", "narrative planning"],
        ["Audience fit", "profile + depth + archetype", "audience/report routing"],
        ["Document quality", "canonical parity + CJK", "canonical/exporter fonts"],
    ]
    story.append(data_table(["Dimension", "Deterministic evidence", "Retry target"], quality_rows, [43, 70, 53]))
    story.append(Spacer(1, 3 * mm))
    story.append(callout(
        "Retry policy",
        "Default maxRetries=2。超過上限保留 audit plan，並輸出 Limited Evidence Brief 或 QA failed；目前 retry instructions 已完成，但 upstream orchestration loop 尚未完整自動化。",
        "amber",
    ))
    story += [PageBreak()]

    story += [p("6. Test evidence", H1)]
    suite = tests["configuredSuites"]
    story.append(data_table(
        ["Suite", "PASS", "FAIL", "Status"],
        [
            ["Report Factory configured", str(suite["reportFactory"]["passed"]), "0", "PASS"],
            ["API Server configured", str(suite["apiServer"]["passed"]), "0", "PASS"],
            ["Total", str(suite["total"]["passed"]), "0", "PASS"],
            ["Focused named subsets", "123", "0", "PASS"],
            ["TypeScript typecheck", "1", "0", "PASS"],
            ["git diff --check", "1", "0", "PASS"],
        ],
        [70, 30, 30, 36],
    ))
    story += [p("6.1 Exact named acceptance", H2)]
    names = tests["namedAcceptance"]["tests"]
    paired = []
    for index in range(0, len(names), 2):
        paired.append([names[index], names[index + 1] if index + 1 < len(names) else ""])
    story.append(data_table(["Named test", "Named test"], paired, [83, 83]))
    story += [PageBreak()]

    story += [p("7. A-G regression matrix", H1)]
    rows = []
    for item in regression["rows"]:
        rows.append([
            item["benchmarkId"],
            item["scenario"],
            "；".join(item["checks"]),
            item["status"],
            "；".join(item["diagnostics"]),
        ])
    story.append(data_table(["ID", "Scenario", "Checks", "Status", "Diagnostics"], rows, [12, 38, 56, 20, 40]))
    story.append(Spacer(1, 4 * mm))
    story.append(callout(
        "Interpretation",
        "A-G 7/7 PASS、unexplained regressions=0。這些是 fixed provider-free contracts，用於防止 deterministic intelligence regression；不得替代 live search、writer、render 與四格式驗收。",
        "teal",
    ))
    story += [p("8. Before / After", H1)]
    story.append(data_table(
        ["面向", "Before", "After"],
        [
            ["Writer", "source/evidence material boundary 不完整", "facts/claims/intelligence safe projection"],
            ["Fusion", "易沿來源或卡片序列", "concept-first graph + stitching/source-order gates"],
            ["Statistics", "抽取與呈現為主", "independent family/CI/p/causal/comparability rules"],
            ["Contradiction", "散落在 cards/prose", "counter/null/mixed + alternatives + quality gate"],
            ["Audience", "輸入與篇幅導向", "5 profiles 控制多個解釋維度"],
            ["Archetype", "較固定骨架", "10 blueprints + minimum conditions"],
            ["Quality", "分散 audits", "10 dimensions + locations + retry + blockExport"],
        ],
        [32, 62, 72],
    ))
    story += [PageBreak()]

    story += [p("9. Live acceptance truth table", H1)]
    live_rows = []
    for case in live["cases"]:
        live_rows.append([
            case["id"],
            case["requiredType"],
            case["currentArchitectureStatus"],
            case["evidence"],
        ])
    story.append(data_table(["Case", "Required", "Status", "Evidence"], live_rows, [35, 46, 24, 61]))
    story.append(Spacer(1, 4 * mm))
    story.append(callout(
        "Why this is PARTIAL",
        "PASS requires at least one complete live Source -> Evidence -> Facts -> Knowledge -> Heterogeneity -> Statistics -> Visual -> Narrative -> Editor -> Quality -> Preview/Markdown/DOCX/PDF path. This post-slice evidence does not contain one. Prior accepted bundles are baseline only.",
        "red",
    ))
    story += [p("9.1 Prior accepted artifacts", H2)]
    story.append(data_table(
        ["Artifact", "Formats", "Caveat"],
        [
            ["urban_heat", "Preview / MD / DOCX / PDF", "Prior live baseline; predates this slice"],
            ["short_video_sleep", "Preview / MD / DOCX / PDF", "Prior live baseline; predates this slice"],
            ["latest actual short_video", "Preview/audit only", "Ollama qwen2.5:3b failed post-edit entailment; export suppressed"],
        ],
        [42, 47, 77],
    ))
    story += [PageBreak()]

    story += [p("10. Files and traceability", H1)]
    file_rows = [
        ["lib/api-zod/src/research-grounding.ts", "Canonical schemas"],
        ["api-server/.../evidenceResolution.ts", "Full-text/abstract access, sections, conflict, locator"],
        ["api-server/.../researchGroundingPipeline.ts", "Resolver integration and atomic metadata"],
        ["report-factory/.../reportComposer.ts", "Extended Atomic Facts and claim graph"],
        ["report-factory/.../reportIntelligence.ts", "Knowledge, heterogeneity, statistics, contradiction, routing"],
        ["report-factory/.../structuredReportPlan.ts", "Canonical intelligence plan"],
        ["api-server/.../report-writer.ts", "Writer-safe packets and scoped intelligence"],
        ["report-factory/.../reportQualityGate.ts", "Ten-dimension quality and retry"],
        ["report-factory/.../formalReportDocument.ts", "Quality/blockExport integration"],
        ["report-factory/.../reportIntelligenceBenchmark.ts", "Fixed A-G suite"],
    ]
    story.append(data_table(["Location", "Role"], file_rows, [92, 74]))
    story += [p("11. Remaining work", H1)]
    remaining = [
        "project_sources/ 以及 7 DOCX + 6 PDF 未提供；無法讀取其方法學 rubric，也未將其當學術證據。",
        "七個正式驗收題尚未完成 post-slice current-architecture live rerun。",
        "Source ingestion 以 HTML/PDF text/GROBID/OCR 為主；DOCX/EPUB 尚無原生 adapter。",
        "複雜多層模型、生存曲線、Bayesian posterior、network meta-analysis 尚無專用 statistical family。",
        "十種 archetype 只有 deterministic router/contract coverage，尚未各自完成 live writer/export acceptance。",
        "Quality retry instructions 與 cap 已完成；自動回到每個 upstream stage 的完整 orchestration loop 尚未完成。",
        "中央 ModelCapability/Context/Cost registry 尚未建立；既有 adapter 只有 purpose/model/timeout/token caps。",
        "Live Image2 provider 未接通；目前只允許 truthful deterministic fallback。",
    ]
    for item in remaining:
        story.append(bullet(item))
    story += [
        Spacer(1, 5 * mm),
        callout(
            "Final token",
            "PARTIAL_REPORT_INTELLIGENCE_UPGRADE",
            "amber",
        ),
        Spacer(1, 5 * mm),
        p("This QA PDF is the only new PDF produced by this slice. Prior research-report PDFs are linked as historical evidence and are not re-labeled as current outputs.", SMALL),
    ]
    return story


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = QaDocTemplate(str(OUTPUT))
    doc.build(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    main()
