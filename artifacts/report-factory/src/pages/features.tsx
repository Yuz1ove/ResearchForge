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
      title: "Multiple Report Types",
      description: "Generate Executive Summaries, Market Analyses, Risk Assessments, Competitive Analyses, and Financial Reports with structures tailored to each specific domain."
    },
    {
      icon: <Target className="h-6 w-6" />,
      title: "Audience Targeting",
      description: "Automatically adjust vocabulary, metric focus, and executive summary depth based on whether your audience is the Board of Directors, Investors, or the General Public."
    },
    {
      icon: <Layers className="h-6 w-6" />,
      title: "Precise Tone Control",
      description: "Dial in the exact voice you need. Choose from Formal & Professional, Analytical & Data-Driven, Persuasive & Strategic, or Neutral & Objective."
    },
    {
      icon: <BarChart3 className="h-6 w-6" />,
      title: "Smart Chart Suggestions",
      description: "Our engine analyzes your data and automatically recommends the most effective chart types (bar, line, scatter, pie) to visualize your key findings."
    },
    {
      icon: <Download className="h-6 w-6" />,
      title: "Multi-Format Export",
      description: "Export instantly to PDF for final delivery, DOCX for further editing, or copy as Markdown for seamless pasting into Notion, Roam, or your company wiki."
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: "Dynamic Referencing",
      description: "Paste massive blocks of unformatted background context, meeting transcripts, or raw data points. The engine synthesizes it into structured narratives."
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1">
        {/* Header */}
        <section className="py-20 bg-muted/30 border-b border-border">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Powerful features for<br />professional output</h1>
            <p className="text-xl text-muted-foreground">Everything you need to produce board-ready documents in a fraction of the time.</p>
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
            <h2 className="text-3xl font-bold text-center mb-12 text-sidebar-foreground">Enterprise-Grade Reliability</h2>
            <div className="space-y-6">
              {[
                "Zero data retention — your proprietary data is never used to train models.",
                "Deterministic outputs — consistent formatting and structure every time.",
                "SOC2 Type II compliance (Coming Q4).",
                "99.99% uptime SLA for Enterprise tiers."
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
                  Try the Generator
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
