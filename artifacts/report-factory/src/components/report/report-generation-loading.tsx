import { useEffect, useState } from "react";
import { CheckCircle2, FileDown, FileText, Search, Sparkles } from "lucide-react";
import reportProgressAnimation from "@/data/report-progress.lottie.json";

type LottieComponent = typeof import("lottie-react").default;

const PROGRESS_STEPS = [
  { label: "搜尋與來源濾網", icon: Search },
  { label: "分析主題脈絡", icon: Sparkles },
  { label: "撰寫報告草稿", icon: FileText },
  { label: "準備匯出格式", icon: FileDown },
] as const;

function FallbackAnimation() {
  return (
    <div className="relative flex h-28 w-36 items-center justify-center" aria-hidden="true">
      <div className="absolute h-20 w-20 animate-spin rounded-full border-4 border-primary/15 border-t-primary" />
      <div className="absolute h-8 w-8 rounded-full bg-primary/10" />
      <FileText className="relative h-6 w-6 text-primary" />
    </div>
  );
}

export function ReportGenerationLoading() {
  const [LottieRenderer, setLottieRenderer] = useState<LottieComponent | null>(null);
  const [lottieFailed, setLottieFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    import("lottie-react")
      .then((module) => {
        if (mounted) setLottieRenderer(() => module.default);
      })
      .catch(() => {
        if (mounted) setLottieFailed(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="report-card bg-card border border-border rounded-xl p-6 flex flex-col gap-5">
      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <div className="flex shrink-0 justify-center md:w-52">
          {lottieFailed || !LottieRenderer ? (
            <FallbackAnimation />
          ) : (
            <LottieRenderer
              animationData={reportProgressAnimation}
              loop
              autoplay
              className="h-36 w-48 max-w-full"
              rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
              onDOMLoaded={() => setLottieFailed(false)}
              onError={() => setLottieFailed(true)}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">ResearchForge 正在生成</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">正在整理搜尋策略與報告草稿</h3>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            系統會先套用 preflight guidance，再整理可用來源、分析架構，最後準備報告與匯出內容。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {PROGRESS_STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {index === 0 ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="text-sm font-medium text-foreground">{step.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
        </div>
        <p className="text-xs text-muted-foreground">缺少可驗證資料時，報告仍會保留「資料來源待補」與查證提醒。</p>
      </div>
    </div>
  );
}
