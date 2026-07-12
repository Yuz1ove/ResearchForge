import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { BrandWordmark } from "@/components/brand-wordmark";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
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
    title: "多型態內容生成",
    desc: "將主題或素材整理成研究報告、總結、摘要、知識庫條目、簡報大綱與資料需求表。",
  },
  {
    icon: <Layers className="h-6 w-6" />,
    title: "架構自動整理",
    desc: "協助釐清主題範圍、核心問題、段落層次、資料來源與後續補充方向。",
  },
  {
    icon: <CheckSquare className="h-6 w-6" />,
    title: "完整度檢查",
    desc: "檢查內容是否具備背景、重點、證據、限制、結論與可追溯來源。",
  },
  {
    icon: <Download className="h-6 w-6" />,
    title: "可複製與匯出內容",
    desc: "一鍵複製草稿與下載 Markdown，方便貼入 Word、Notion 或 Google Docs 持續修訂。",
  },
];

const STEPS = [
  { n: "01", title: "輸入主題", desc: "填寫題目、素材或想整理的問題。" },
  { n: "02", title: "選擇用途", desc: "決定要生成報告、摘要、總結或知識庫內容。" },
  { n: "03", title: "整理來源", desc: "檢查資料、關鍵概念與可用證據。" },
  { n: "04", title: "生成草稿", desc: "輸出可編輯、可匯出的結構化內容。" },
];

const REPORT_PREVIEWS = [
  {
    topic: "AI 對高中生學習方式的影響",
    outputType: "研究報告",
    question: "整理 AI 工具如何影響學習效率、自主學習與引用倫理。",
    variables: ["章節：背景、文獻、討論", "證據：研究資料與案例", "提醒：標示資料來源"],
    sections: [
      { label: "架構完整", value: 90 },
      { label: "來源清楚", value: 82 },
      { label: "待補資料", value: 48 },
    ],
  },
  {
    topic: "台北金融科技展重點整理",
    outputType: "知識庫",
    question: "將活動資訊、技術趨勢、廠商亮點與待追蹤議題整理成可查詢條目。",
    variables: ["條目：主題、摘要、來源", "標籤：金融科技、AI、資安", "提醒：補上官方連結"],
    sections: [
      { label: "條目清楚", value: 86 },
      { label: "標籤完整", value: 76 },
      { label: "待補資料", value: 55 },
    ],
  },
  {
    topic: "塑膠微粒資料摘要",
    outputType: "摘要",
    question: "從多篇來源擷取核心定義、環境風險、研究限制與可引用重點。",
    variables: ["輸出：短摘要與重點條列", "證據：來源摘要與關鍵句", "提醒：避免未證實結論"],
    sections: [
      { label: "重點濃縮", value: 88 },
      { label: "引用可追溯", value: 80 },
      { label: "待補資料", value: 42 },
    ],
  },
];

const HERO_FLOATERS = [
  {
    className:
      "left-[8%] top-[12%] h-36 w-36 bg-[radial-gradient(circle_at_30%_30%,hsl(var(--primary)/0.24),transparent_72%)]",
    duration: 10,
    delay: 0,
  },
  {
    className:
      "right-[10%] top-[18%] h-28 w-28 bg-[radial-gradient(circle_at_50%_50%,hsl(18_100%_72%/0.22),transparent_70%)]",
    duration: 12,
    delay: 0.8,
  },
  {
    className:
      "left-[18%] bottom-[14%] h-24 w-24 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--foreground)/0.08),transparent_72%)]",
    duration: 11,
    delay: 0.35,
  },
];

function HeroAmbient() {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,hsl(var(--background))_0%,transparent_32%,transparent_68%,hsl(var(--accent)/0.4)_100%)] opacity-70" />

      {HERO_FLOATERS.map((floater, index) => (
        <motion.div
          key={index}
          className={`hero-ambient absolute rounded-full blur-3xl ${floater.className}`}
          animate={
            reduceMotion
              ? { opacity: 0.5 }
              : {
                  x: [0, 12, -6, 0],
                  y: [0, -18, 8, 0],
                  opacity: [0.3, 0.55, 0.38, 0.3],
                  scale: [1, 1.04, 0.98, 1],
                }
          }
          transition={{
            duration: reduceMotion ? 0.2 : floater.duration,
            delay: floater.delay,
            repeat: reduceMotion ? 0 : Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      <motion.div
        className="absolute left-1/2 top-1/2 h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10"
        animate={
          reduceMotion
            ? { opacity: 0.45 }
            : { opacity: [0.32, 0.55, 0.32], scale: [0.98, 1.02, 0.98] }
        }
        transition={{
          duration: reduceMotion ? 0.2 : 8,
          repeat: reduceMotion ? 0 : Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}

function ReportReadinessPreview() {
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = REPORT_PREVIEWS[activeIndex] ?? REPORT_PREVIEWS[0];

  const averageScore = useMemo(() => {
    const total = active.sections.reduce((sum, section) => sum + section.value, 0);
    return Math.round(total / active.sections.length);
  }, [active]);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % REPORT_PREVIEWS.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-3">互動式內容整理預覽</h2>
            <p className="text-muted-foreground max-w-2xl">
              點選不同範例，頁面會即時切換輸出型態、整理方向與內容準備度。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {REPORT_PREVIEWS.map((preview, index) => (
              <button
                key={preview.topic}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                  activeIndex === index
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                題目 {index + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <motion.div
            key={active.topic}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <p className="mb-2 text-sm font-medium text-primary">目前主題 · {active.outputType}</p>
            <h3 className="mb-4 text-2xl font-semibold">{active.topic}</h3>
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="mb-2 text-sm font-medium text-foreground">整理方向</p>
              <p className="text-muted-foreground">{active.question}</p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {active.variables.map((item) => (
                <div key={item} className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
                  {item}
                </div>
              ))}
            </div>
          </motion.div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-primary">內容準備度</p>
                <p className="text-sm text-muted-foreground">依目前主題初步估算</p>
              </div>
              <div className="text-4xl font-bold text-foreground">{averageScore}%</div>
            </div>
            <div className="space-y-4">
              {active.sections.map((section) => (
                <div key={section.label}>
                  <div className="mb-2 flex justify-between text-sm">
                    <span>{section.label}</span>
                    <span className="text-muted-foreground">{section.value}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={reduceMotion ? false : { width: 0 }}
                      animate={{ width: `${section.value}%` }}
                      transition={{ duration: reduceMotion ? 0.05 : 0.55, ease: "easeOut" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Home() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative py-24 md:py-36 overflow-hidden">
          <HeroAmbient />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,hsl(var(--primary)/0.12),transparent)] pointer-events-none" />
          <motion.div
            className="container mx-auto px-4 relative z-10 text-center max-w-4xl"
            initial={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: 0, y: 18, filter: "blur(10px)" }
            }
            animate={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, filter: "blur(0px)" }
            }
            transition={{
              duration: reduceMotion ? 0.16 : 0.55,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <motion.div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8"
              animate={reduceMotion ? undefined : { y: [0, -2, 0] }}
              transition={{
                duration: 4.5,
                repeat: reduceMotion ? 0 : Infinity,
                ease: "easeInOut",
              }}
            >
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
              AI 知識整理工作台 · 報告、總結、摘要與知識庫
            </motion.div>

            <motion.h1
              className="mb-6 leading-tight text-4xl md:text-6xl text-foreground"
              initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.46, delay: 0.08 }}
            >
              <BrandWordmark className="text-inherit" />
            </motion.h1>
            <motion.p
              className="text-xl md:text-2xl text-muted-foreground mb-4 font-medium"
              initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.46, delay: 0.14 }}
            >
              輸入主題或素材，快速整理成報告、總結、摘要、<br className="hidden md:block" />
              知識庫條目與可追溯的內容草稿。
            </motion.p>
            <motion.p
              className="text-base text-muted-foreground mb-10 max-w-2xl mx-auto"
              initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.46, delay: 0.2 }}
            >
              適合學生、研究者、專題製作者，以及需要把資料整理成清楚內容的人。
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
              initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.46, delay: 0.26 }}
            >
              <Link href="/generator" data-testid="button-hero-try">
                <Button size="lg" className="h-14 px-8 text-base shadow-lg">
                  開始整理內容 <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/features" data-testid="button-hero-features">
                <Button size="lg" variant="outline" className="h-14 px-8 text-base">
                  查看整理功能
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────────── */}
        <section className="py-20 bg-muted/30 border-y border-border">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">為什麼用 ResearchForge 整理內容？</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                不只是填表單，重點是把題目、證據、脈絡與結論整理成可被檢查、可再利用的內容。
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
              <p className="text-muted-foreground">從零散素材到完整草稿，逐步補齊需要的結構與資料來源。</p>
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

        <ReportReadinessPreview />

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section className="py-20 bg-sidebar text-sidebar-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-sidebar-foreground">
              立即建立你的內容草稿
            </h2>
            <p className="text-sidebar-foreground/80 mb-8 max-w-xl mx-auto">
              不需要登入，先把主題、重點與資料缺口整理清楚。
            </p>
            <Link href="/generator" data-testid="button-bottom-cta">
              <Button
                size="lg"
                className="h-14 px-8 text-base bg-primary text-primary-foreground hover:bg-primary/90"
              >
                開始整理內容 <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
