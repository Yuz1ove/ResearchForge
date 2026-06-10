import { Link } from "wouter";
import { BarChart } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-sidebar text-sidebar-foreground py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4" data-testid="link-footer-logo">
              <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
                <BarChart className="h-5 w-5" />
              </div>
              <span className="font-bold text-lg tracking-tight">Report Factory AI</span>
            </Link>
            <p className="text-sidebar-foreground/70 text-sm max-w-xs">
              The professional standard for AI-generated business reports. Precise, data-forward, and built for consultants.
            </p>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4 text-sidebar-foreground">Product</h3>
            <ul className="space-y-2 text-sm text-sidebar-foreground/70">
              <li><Link href="/features" className="hover:text-primary transition-colors" data-testid="link-footer-features">Features</Link></li>
              <li><Link href="/pricing" className="hover:text-primary transition-colors" data-testid="link-footer-pricing">Pricing</Link></li>
              <li><Link href="/faq" className="hover:text-primary transition-colors" data-testid="link-footer-faq">FAQ</Link></li>
              <li><Link href="/generator" className="hover:text-primary transition-colors" data-testid="link-footer-generator">Try Generator</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4 text-sidebar-foreground">Legal</h3>
            <ul className="space-y-2 text-sm text-sidebar-foreground/70">
              <li><a href="#" className="hover:text-primary transition-colors" data-testid="link-footer-terms">Terms of Service</a></li>
              <li><a href="#" className="hover:text-primary transition-colors" data-testid="link-footer-privacy">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-primary transition-colors" data-testid="link-footer-contact">Contact Us</a></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-sidebar-border mt-12 pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-sidebar-foreground/50">
          <p>&copy; {new Date().getFullYear()} Report Factory AI. All rights reserved.</p>
          <div className="flex items-center gap-4 mt-4 md:mt-0">
            <span>Built for professionals</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
