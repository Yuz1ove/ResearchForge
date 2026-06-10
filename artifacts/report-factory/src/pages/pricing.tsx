import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Check } from "lucide-react";

export function Pricing() {
  const tiers = [
    {
      name: "免費版",
      price: "$0",
      period: "永久免費",
      description: "適合個人試用平台功能。",
      features: [
        "每月 10 份報告",
        "標準報告範本",
        "每份報告最多 1,000 字",
        "僅支援 Markdown 匯出",
        "標準客戶支援"
      ],
      cta: "免費開始使用",
      href: "/generator",
      popular: false
    },
    {
      name: "專業版",
      price: "$49",
      period: "每位使用者 / 月",
      description: "適合需要更強大功能的顧問與分析師。",
      features: [
        "無限報告生成",
        "所有進階範本",
        "每份報告最多 5,000 字",
        "PDF、DOCX 及 Markdown 匯出",
        "自訂品牌與企業識別",
        "圖表生成建議",
        "優先電子郵件支援"
      ],
      cta: "開始 14 天試用",
      href: "/generator",
      popular: true
    },
    {
      name: "企業版",
      price: "客製報價",
      period: "",
      description: "適合需要安全合規的企業團隊。",
      features: [
        "包含專業版所有功能",
        "客製化企業範本",
        "SSO / SAML 整合",
        "零數據留存政策",
        "專屬客戶成功經理",
        "API 存取權限",
        "客製化 SLA 協議"
      ],
      cta: "聯絡銷售團隊",
      href: "#",
      popular: false
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        <section className="py-20 pb-10">
          <div className="container mx-auto px-4 text-center max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">簡單透明的定價</h1>
            <p className="text-xl text-muted-foreground">免費開始，需要更多時再升級。隨時可以取消。</p>
          </div>
        </section>

        <section className="py-10 pb-24">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
              {tiers.map((tier, i) => (
                <div
                  key={i}
                  className={`relative flex flex-col p-8 rounded-2xl border ${
                    tier.popular
                      ? "border-primary shadow-lg scale-100 md:scale-105 z-10 bg-card"
                      : "border-border bg-card/50"
                  }`}
                >
                  {tier.popular && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
                      最受歡迎
                    </div>
                  )}

                  <div className="mb-8">
                    <h3 className="text-2xl font-bold mb-2">{tier.name}</h3>
                    <p className="text-muted-foreground text-sm h-10">{tier.description}</p>
                  </div>

                  <div className="mb-8">
                    <span className="text-5xl font-extrabold">{tier.price}</span>
                    {tier.period && <span className="text-muted-foreground ml-2">{tier.period}</span>}
                  </div>

                  <ul className="space-y-4 mb-8 flex-1">
                    {tier.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-3 text-sm">
                        <Check className="h-5 w-5 text-primary shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href={tier.href} data-testid={`button-pricing-${i}`}>
                    <Button
                      className="w-full h-12 text-base"
                      variant={tier.popular ? "default" : "outline"}
                    >
                      {tier.cta}
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
