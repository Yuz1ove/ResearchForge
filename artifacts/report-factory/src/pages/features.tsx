import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  FileText,
  BarChart3,
  Target,
  Layers,
  Download,
  Zap,
  CheckCircle
} from "lucide-react";

export function Features() {
  const features = [
    {
      icon: <FileText className="h-6 w-6" />,
      title: "多樣報告類型",
      description: "生成執行摘要、市場分析、風險評估、競爭分析與財務報告，每種類型均依其專業領域提供量身訂製的結構。"
    },
    {
      icon: <Target className="h-6 w-6" />,
      title: "目標讀者精準設定",
      description: "根據讀者對象（董事會、投資人或一般大眾）自動調整詞彙選用、指標重點與摘要深度。"
    },
    {
      icon: <Layers className="h-6 w-6" />,
      title: "精確語氣控制",
      description: "精準設定您需要的語氣：正式專業、分析數據導向、說服策略型，或中立客觀，四種風格自由切換。"
    },
    {
      icon: <BarChart3 className="h-6 w-6" />,
      title: "智慧圖表建議",
      description: "引擎分析您的數據後，自動推薦最適合的圖表類型（長條圖、折線圖、散點圖、圓餅圖），讓關鍵發現一目瞭然。"
    },
    {
      icon: <Download className="h-6 w-6" />,
      title: "多格式匯出",
      description: "即時匯出為 PDF 最終版本、DOCX 供進一步編輯，或複製為 Markdown 無縫貼入 Notion、Roam 或公司 Wiki。"
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: "動態參考資料整合",
      description: "貼入大量非結構化的背景資訊、會議記錄或原始數據，引擎將自動整合並轉化為結構清晰的敘事內容。"
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Header */}
        <section className="py-20 bg-muted/30 border-b border-border">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">強大功能，<br />輸出專業成果</h1>
            <p className="text-xl text-muted-foreground">一切您所需要的工具，讓您在極短時間內產出董事會級別的文件。</p>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="py-20">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {features.map((feature, i) => (
                <div key={i} className="flex gap-6">
                  <div className="shrink-0 mt-1 bg-primary/10 p-3 rounded-lg text-primary">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Quality Guarantees */}
        <section className="py-20 bg-sidebar text-sidebar-foreground">
          <div className="container mx-auto px-4 max-w-4xl">
            <h2 className="text-3xl font-bold text-center mb-12 text-sidebar-foreground">企業級可靠性保證</h2>
            <div className="space-y-6">
              {[
                "零數據留存——您的專有資料絕不用於模型訓練。",
                "確定性輸出——每次均保證一致的格式與結構。",
                "SOC2 Type II 合規認證（Q4 即將推出）。",
                "企業方案享有 99.99% 正常運行時間 SLA。"
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-4 bg-sidebar-accent/50 p-4 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-primary shrink-0" />
                  <span className="text-lg">{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-16 text-center">
              <Link href="/generator" data-testid="button-features-try">
                <Button size="lg" className="h-14 px-8 text-base bg-primary text-primary-foreground">
                  立即試用生成器
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
