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
      q: "ResearchForge 可以整理哪些內容？",
      a: "可以協助整理研究報告、總結、摘要、知識庫條目、資料需求表、簡報大綱與其他結構化內容草稿。"
    },
    {
      q: "它會直接替我完成最終內容嗎？",
      a: "不會。ResearchForge 產生的是可修改的草稿、整理架構與檢查清單；最後判讀、取捨與結論仍需要由使用者確認。"
    },
    {
      q: "可以生成哪些類型的報告？",
      a: "目前支援研究報告、專題報告、實驗報告、摘要、總結、知識庫整理、資料需求表、圖表建議與簡報大綱。"
    },
    {
      q: "生成後可以編輯報告嗎？",
      a: "可以。草稿內容可複製或匯出，方便貼入 Word、Google Docs、Notion 或作品說明書中繼續修正。"
    },
    {
      q: "圖表建議的準確度如何？",
      a: "圖表建議會依主題與資料型態推薦適合的視覺化方式，例如比較表、折線圖、長條圖、散佈圖或時間軸。實際圖表仍需使用真實資料製作。"
    },
    {
      q: "可以處理還很模糊的題目嗎？",
      a: "可以。若題目太短或太廣，系統會先產生可整理方向與搜尋關鍵詞，協助把想法收斂成可閱讀、可查證的內容架構。"
    },
    {
      q: "參考資料應該怎麼提供？",
      a: "建議貼入和主題直接相關的摘要、筆記、課本段落、觀察紀錄或可信來源重點。資料越聚焦，產生的內容架構越容易檢查。"
    },
    {
      q: "可以用在學校作業、研究或知識庫嗎？",
      a: "可以。它適合先建立草稿與資料脈絡，再依老師、團隊或平台格式調整內容。"
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
              <p className="text-xl text-muted-foreground">關於知識整理與內容生成，您需要知道的重點。</p>
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
              <p className="text-muted-foreground">建議先從一個清楚主題開始，逐步補上資料來源、重點與待查問題。</p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
