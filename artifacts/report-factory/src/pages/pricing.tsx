import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Check } from "lucide-react";

export function Pricing() {
  const tiers = [
    {
      name: "Free",
      price: "$0",
      period: "forever",
      description: "For individuals trying out the platform.",
      features: [
        "10 reports per month",
        "Standard templates",
        "Up to 1,000 words per report",
        "Markdown export only",
        "Standard support"
      ],
      cta: "Try for free",
      href: "/generator",
      popular: false
    },
    {
      name: "Pro",
      price: "$49",
      period: "per user / month",
      description: "For consultants and analysts who need more power.",
      features: [
        "Unlimited reports",
        "All premium templates",
        "Up to 5,000 words per report",
        "PDF, DOCX, and Markdown export",
        "Custom branding & logos",
        "Chart generation suggestions",
        "Priority email support"
      ],
      cta: "Start 14-day trial",
      href: "/generator",
      popular: true
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      description: "For teams requiring security and compliance.",
      features: [
        "Everything in Pro",
        "Custom company templates",
        "SSO / SAML integration",
        "Zero data retention policy",
        "Dedicated account manager",
        "API access",
        "Custom SLAs"
      ],
      cta: "Contact sales",
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
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Simple, transparent pricing</h1>
            <p className="text-xl text-muted-foreground">Start for free, upgrade when you need more power. Cancel anytime.</p>
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
                      Most Popular
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
                  
                  <Link href={tier.href} data-testid={`button-pricing-${tier.name.toLowerCase()}`}>
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
