import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Link } from "wouter";
import { ArrowRight, Zap, Shield, FileText, CheckCircle2 } from "lucide-react";

export function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-20 md:py-32 overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
                <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                Report Factory AI 2.0 is live
              </div>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-6 leading-tight">
                Stop writing reports. <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">Start delivering insights.</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
                The professional standard for AI-generated business reports. Turn raw data and notes into board-ready executive summaries, market analyses, and risk assessments in seconds.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/generator" data-testid="button-hero-try">
                  <Button size="lg" className="h-14 px-8 text-base shadow-xl">
                    Try the Generator <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/features" data-testid="button-hero-features">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-base">
                    View Features
                  </Button>
                </Link>
              </div>
              <div className="mt-10 flex items-center justify-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> No credit card required
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> 14-day free trial
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Logos Section */}
        <section className="py-10 border-y border-border bg-muted/30">
          <div className="container mx-auto px-4 text-center">
            <p className="text-sm font-medium text-muted-foreground mb-6 uppercase tracking-wider">Trusted by consulting teams at</p>
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-60 grayscale">
              <div className="text-xl font-bold font-serif">Acme Corp</div>
              <div className="text-xl font-bold font-sans">Globex</div>
              <div className="text-xl font-bold font-mono">Initech</div>
              <div className="text-xl font-bold font-serif italic">Soylent</div>
              <div className="text-xl font-bold font-sans tracking-widest">UMBRELLA</div>
            </div>
          </div>
        </section>

        {/* Features Preview */}
        <section className="py-24 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Precision-engineered for professionals</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">We built Report Factory AI for analysts who need absolute control over tone, structure, and data accuracy.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-card border border-border rounded-xl p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary mb-6">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Structured Outputs</h3>
                <p className="text-muted-foreground">Choose from battle-tested templates for market analysis, executive summaries, and risk assessments.</p>
              </div>
              
              <div className="bg-card border border-border rounded-xl p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary mb-6">
                  <Zap className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Instant Generation</h3>
                <p className="text-muted-foreground">Turn raw notes and data points into cohesive, multi-page reports in under 10 seconds.</p>
              </div>
              
              <div className="bg-card border border-border rounded-xl p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary mb-6">
                  <Shield className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Enterprise Grade</h3>
                <p className="text-muted-foreground">Zero data retention options, SSO support, and strict formatting guarantees for board-ready documents.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 bg-sidebar text-sidebar-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-sidebar-foreground">Ready to upgrade your workflow?</h2>
            <p className="text-sidebar-foreground/80 mb-10 max-w-2xl mx-auto text-lg">
              Join thousands of professionals saving hours every week on report generation.
            </p>
            <Link href="/generator" data-testid="button-bottom-cta">
              <Button size="lg" className="h-14 px-8 text-base bg-primary text-primary-foreground hover:bg-primary/90">
                Start Generating Now
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
