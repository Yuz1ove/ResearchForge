import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand-wordmark";

export function Navbar() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "首頁" },
    { href: "/features", label: "功能介紹" },
    { href: "/pricing", label: "定價方案" },
    { href: "/faq", label: "常見問題" },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2" data-testid="link-logo">
            <img
              src="/assets/researchforge_icon_transparent.png"
              alt="ResearchForge"
              className="h-9 w-9 rounded-md bg-background object-contain p-0.5"
            />
            <BrandWordmark className="text-lg" />
          </Link>
        </div>

        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                location === link.href ? "text-foreground" : "text-muted-foreground"
              }`}
              data-testid={`link-nav-${link.label}`}
            >
              {link.label}
            </Link>
          ))}
          <div className="flex items-center gap-4 ml-4 pl-4 border-l border-border">
            <Link href="/generator" data-testid="link-nav-try-free">
              <Button>免費試用</Button>
            </Link>
          </div>
        </div>

        <button
          className="md:hidden p-2 text-foreground"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          data-testid="button-mobile-menu"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

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
                data-testid={`link-mobile-nav-${link.label}`}
              >
                {link.label}
              </Link>
            ))}
            <Link href="/generator" onClick={() => setIsMobileMenuOpen(false)} data-testid="link-mobile-nav-try-free">
              <Button className="w-full">免費試用</Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
