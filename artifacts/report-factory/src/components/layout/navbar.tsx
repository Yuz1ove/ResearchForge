import { Link, useLocation } from "wouter";
import { Menu, X, BarChart } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/features", label: "Features" },
    { href: "/pricing", label: "Pricing" },
    { href: "/faq", label: "FAQ" },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2" data-testid="link-logo">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
              <BarChart className="h-5 w-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">Report Factory AI</span>
          </Link>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                location === link.href ? "text-foreground" : "text-muted-foreground"
              }`}
              data-testid={`link-nav-${link.label.toLowerCase()}`}
            >
              {link.label}
            </Link>
          ))}
          <div className="flex items-center gap-4 ml-4 pl-4 border-l border-border">
            <Link href="/generator" data-testid="link-nav-try-free">
              <Button>Try Free</Button>
            </Link>
          </div>
        </div>

        {/* Mobile Nav Toggle */}
        <button
          className="md:hidden p-2 text-foreground"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          data-testid="button-mobile-menu"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Nav Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="container mx-auto px-4 py-4 flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  location === link.href ? "text-foreground" : "text-muted-foreground"
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
                data-testid={`link-mobile-nav-${link.label.toLowerCase()}`}
              >
                {link.label}
              </Link>
            ))}
            <Link href="/generator" onClick={() => setIsMobileMenuOpen(false)} data-testid="link-mobile-nav-try-free">
              <Button className="w-full">Try Free</Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
