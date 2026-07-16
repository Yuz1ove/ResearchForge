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
      title: "多用途內容架構",
      description: "生成報告、總結、摘要、知識庫條目、研究計畫與簡報大綱等不同內容骨架。"
    },
    {
      icon: <Target className="h-6 w-6" />,
      title: "主題問題收斂",
      description: "把模糊題目拆成核心問題、子題、關鍵詞與可查證方向。"
    },
    {
      icon: <Layers className="h-6 w-6" />,
      title: "資料脈絡整理",
      description: "將來源、摘要、重點、限制與待補資料整理成清楚可追溯的內容流程。"
    },
    {
      icon: <BarChart3 className="h-6 w-6" />,
      title: "圖表與數據建議",
      description: "依照主題推薦適合的表格、比較圖、時間軸或重點矩陣，讓內容更容易閱讀。"
    },
    {
      icon: <Download className="h-6 w-6" />,
      title: "多格式匯出",
      description: "匯出或複製草稿內容，方便貼入 Word、Google Docs、Notion 或報告說明書繼續修改。"
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: "參考資料整合",
      description: "整理可信來源、摘要與資料缺口，避免內容只有想法而缺少可追溯的證據。"
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Header */}
        <section className="py-20 bg-muted/30 border-b border-border">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">知識整理工具，<br />從主題到內容</h1>
            <p className="text-xl text-muted-foreground">協助把研究構想、零散素材與來源資料整理成可閱讀、可追溯、可再利用的內容草稿。</p>
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
            <h2 className="text-3xl font-bold text-center mb-12 text-sidebar-foreground">內容準備檢查</h2>
            <div className="space-y-6">
              {[
                "主題是否能形成清楚的核心問題。",
                "內容是否具備背景、重點、證據與結論。",
                "資料來源是否可追溯，並標示仍需補查的部分。",
                "輸出是否適合報告、摘要、總結或知識庫使用。"
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
                  搜尋論文與摘要
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
