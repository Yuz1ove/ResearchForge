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
              AI 商業報告生成的專業標準。精準、以數據為核心，專為顧問與分析師打造。
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-sidebar-foreground">產品</h3>
            <ul className="space-y-2 text-sm text-sidebar-foreground/70">
              <li><Link href="/features" className="hover:text-primary transition-colors" data-testid="link-footer-features">功能介紹</Link></li>
              <li><Link href="/pricing" className="hover:text-primary transition-colors" data-testid="link-footer-pricing">定價方案</Link></li>
              <li><Link href="/faq" className="hover:text-primary transition-colors" data-testid="link-footer-faq">常見問題</Link></li>
              <li><Link href="/generator" className="hover:text-primary transition-colors" data-testid="link-footer-generator">立即試用</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-sidebar-foreground">法律</h3>
            <ul className="space-y-2 text-sm text-sidebar-foreground/70">
              <li><a href="#" className="hover:text-primary transition-colors" data-testid="link-footer-terms">服務條款</a></li>
              <li><a href="#" className="hover:text-primary transition-colors" data-testid="link-footer-privacy">隱私政策</a></li>
              <li><a href="#" className="hover:text-primary transition-colors" data-testid="link-footer-contact">聯絡我們</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-sidebar-border mt-12 pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-sidebar-foreground/50">
          <p>&copy; {new Date().getFullYear()} ResearchForge. 保留所有權利。</p>
          <div className="flex items-center gap-4 mt-4 md:mt-0">
            <span>專為專業人士打造</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
