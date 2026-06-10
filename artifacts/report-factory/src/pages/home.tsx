import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Link } from "wouter";
import {
  ArrowRight,
  FileText,
  Layers,
  CheckSquare,
  Download,
  ChevronRight,
} from "lucide-react";

const FEATURES = [
  {
    icon: <FileText className="h-6 w-6" />,
    title: "多類型報告生成",
    desc: "學校研究報告、科展報告、商業分析、市場研究……九種類型，自動套用對應的結構與寫作框架。",
  },
  {
    icon: <Layers className="h-6 w-6" />,
    title: "研究架構自動建立",
    desc: "從研究背景、研究問題、假設、文獻探討大綱到研究方法，完整架構一鍵生成。",
  },
  {
    icon: <CheckSquare className="h-6 w-6" />,
    title: "報告品質檢查",
    desc: "生成後自動比對九項報告必備要素，讓你在提交前確認架構完整無缺漏。",
  },
  {
    icon: <Download className="h-6 w-6" />,
    title: "可複製與匯出內容",
    desc: "一鍵複製純文字、下載 Markdown 檔，直接貼入 Word、Notion 或 Google Docs 繼續修改。",
  },
];

const STEPS = [
  { n: "01", title: "輸入主題", desc: "填寫你的報告主題，越具體越好。" },
  { n: "02", title: "選擇類型", desc: "選擇報告類型與寫作風格。" },
  { n: "03", title: "生成報告", desc: "點擊按鈕，秒速產出完整報告草稿。" },
  { n: "04", title: "檢查與匯出", desc: "確認品質清單，複製或下載內容。" },
];

export function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative py-24 md:py-36 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,hsl(var(--primary)/0.12),transparent)] pointer-events-none" />
          <div className="container mx-auto px-4 relative z-10 text-center max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
              AI 報告生成器 · 學生與研究者專用
            </div>

            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6 leading-tight">
              Report Factory AI
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-4 font-medium">
              輸入主題，快速生成結構完整、格式清楚、<br className="hidden md:block" />
              可後續修改的專業報告草稿。
            </p>
            <p className="text-base text-muted-foreground mb-10 max-w-2xl mx-auto">
              適合學生、研究報告撰寫者、專題製作者，以及任何需要快速建立報告架構的人。
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/generator" data-testid="button-hero-try">
                <Button size="lg" className="h-14 px-8 text-base shadow-lg">
                  開始生成報告 <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/features" data-testid="button-hero-features">
                <Button size="lg" variant="outline" className="h-14 px-8 text-base">
                  查看報告格式
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────────── */}
        <section className="py-20 bg-muted/30 border-y border-border">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">為什麼選擇 Report Factory AI？</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                不只是填表單——幫你建立完整研究架構，節省從零開始的時間。
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {FEATURES.map((f, i) => (
                <div
                  key={i}
                  className="bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4"
                >
                  <div className="h-11 w-11 bg-primary/10 rounded-lg flex items-center justify-center text-primary shrink-0">
                    {f.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-base mb-2">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">四步驟完成報告草稿</h2>
              <p className="text-muted-foreground">簡單、快速、可立即使用的報告架構。</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              {STEPS.map((s, i) => (
                <div key={i} className="relative flex flex-col items-center text-center">
                  <div className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mb-4 shadow">
                    {s.n}
                  </div>
                  {i < STEPS.length - 1 && (
                    <ChevronRight className="absolute top-5 -right-3 h-4 w-4 text-muted-foreground hidden md:block" />
                  )}
                  <h3 className="font-semibold mb-1">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section className="py-20 bg-sidebar text-sidebar-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-sidebar-foreground">
              立即生成你的第一份報告草稿
            </h2>
            <p className="text-sidebar-foreground/80 mb-8 max-w-xl mx-auto">
              免費使用，不需要登入，30 秒內完成。
            </p>
            <Link href="/generator" data-testid="button-bottom-cta">
              <Button
                size="lg"
                className="h-14 px-8 text-base bg-primary text-primary-foreground hover:bg-primary/90"
              >
                開始生成報告 <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
