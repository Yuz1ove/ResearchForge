import { Link } from "wouter";
import { BrandWordmark } from "@/components/brand-wordmark";

export function Footer() {
  return (
    <footer className="border-t border-border bg-sidebar text-sidebar-foreground py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4" data-testid="link-footer-logo">
              <img
                src="/assets/researchforge_icon_transparent.png"
                alt="ResearchForge"
                className="h-8 w-8 shrink-0 object-contain"
              />
              <BrandWordmark className="text-lg" />
            </Link>
            <p className="text-sidebar-foreground/70 text-sm max-w-xs">
              知識整理與報告生成工作台。協助整理主題、來源、摘要、總結與可追溯內容草稿。
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-sidebar-foreground">報告工具</h3>
            <ul className="space-y-2 text-sm text-sidebar-foreground/70">
              <li><Link href="/features" className="hover:text-primary transition-colors" data-testid="link-footer-features">功能介紹</Link></li>
              <li><Link href="/faq" className="hover:text-primary transition-colors" data-testid="link-footer-faq">常見問題</Link></li>
              <li><Link href="/generator" className="hover:text-primary transition-colors" data-testid="link-footer-generator">開始整理內容</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-sidebar-foreground">整理輸出</h3>
            <ul className="space-y-2 text-sm text-sidebar-foreground/70">
              <li><Link href="/generator" className="hover:text-primary transition-colors" data-testid="link-footer-research-plan">研究報告</Link></li>
              <li><Link href="/generator" className="hover:text-primary transition-colors" data-testid="link-footer-experiment-records">摘要總結</Link></li>
              <li><Link href="/generator" className="hover:text-primary transition-colors" data-testid="link-footer-final-report">知識庫條目</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-sidebar-border mt-12 pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-sidebar-foreground/50">
          <p>&copy; {new Date().getFullYear()} ResearchForge. 保留所有權利。</p>
          <div className="flex items-center gap-4 mt-4 md:mt-0">
            <span>專為清楚整理知識而打造</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
