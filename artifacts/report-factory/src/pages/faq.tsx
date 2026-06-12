import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function FAQ() {
  const faqs = [
    {
      q: "ResearchForge 如何生成報告內容？",
      a: "我們使用針對商業與財務文件微調的大型語言模型。當您提交參考資料與設定後，模型會將您的數據整合至所選結構中，同時維持您要求的語氣與讀者設定。"
    },
    {
      q: "我的資料安全嗎？",
      a: "是的。對於專業版與企業版用戶，我們提供嚴格的零數據留存政策。您的資料僅在記憶體中處理以生成報告，處理完畢後立即清除，絕不用於模型訓練。"
    },
    {
      q: "可以生成哪些類型的報告？",
      a: "目前支援執行摘要、市場分析、風險評估、競爭分析、財務報告及專案狀態更新。我們會根據用戶反饋定期新增範本類型。"
    },
    {
      q: "生成後可以編輯報告嗎？",
      a: "可以。所有報告均可匯出為 DOCX 格式（專業版方案），或複製為 Markdown，方便貼入 Word、Google Docs、Notion 或任何其他編輯器進行最後修改。"
    },
    {
      q: "圖表建議的準確度如何？",
      a: "圖表建議引擎會分析您參考資料中的量化數據，推薦最能呈現敘事的標準視覺化類型（例如：比較用長條圖、趨勢用折線圖）。實際圖表仍需在您慣用的工具（Excel、Tableau 等）中建立。"
    },
    {
      q: "你們有提供公司客製化範本嗎？",
      a: "有，企業版方案提供客製化範本開發服務。我們的團隊將與您合作，將公司特定的格式規範、品牌識別與結構要求整合至引擎中。"
    },
    {
      q: "參考資料最多可以貼入多少文字？",
      a: "免費版用戶最多可貼入 5,000 字的背景資料；專業版用戶最多可提供 25,000 字（約 50 頁文字）；企業版用戶則有客製化上限。"
    },
    {
      q: "可以隨時取消訂閱嗎？",
      a: "可以，您可以隨時在帳戶設定中管理或取消訂閱。取消後，您仍可繼續使用專業版功能至當前計費週期結束。"
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        <section className="py-20">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">常見問題</h1>
              <p className="text-xl text-muted-foreground">關於 ResearchForge，您需要知道的一切。</p>
            </div>

            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, i) => (
                <AccordionItem key={i} value={`item-${i}`}>
                  <AccordionTrigger className="text-left text-lg font-medium" data-testid={`accordion-trigger-${i}`}>
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            <div className="mt-16 text-center p-8 bg-muted/50 rounded-xl border border-border">
              <h3 className="text-xl font-semibold mb-2">還有其他問題？</h3>
              <p className="text-muted-foreground mb-6">我們的支援團隊隨時準備為您解答任何疑問。</p>
              <a href="mailto:support@example.com" className="text-primary font-medium hover:underline">
                聯絡客服支援 &rarr;
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
