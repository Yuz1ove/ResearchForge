import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const BRAND_ORANGE = "#F26422";

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
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto flex h-20 items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-3"
          data-testid="link-logo"
        >
          <div
            className="h-11 w-11 rounded-2xl shadow-sm"
            style={{ backgroundColor: BRAND_ORANGE }}
            aria-hidden="true"
          />
          <span className="text-[1.95rem] font-semibold tracking-[-0.04em] leading-none">
            <span className="text-foreground">Research</span>
            <span style={{ color: BRAND_ORANGE }}>Forge</span>
          </span>
        </Link>

        <div className="hidden min-[860px]:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-semibold transition-colors hover:text-foreground ${
                location === link.href ? "text-foreground" : "text-muted-foreground"
              }`}
              data-testid={`link-nav-${link.label}`}
            >
              {link.label}
            </Link>
          ))}
          <div className="ml-3 flex items-center border-l border-border pl-6">
            <Link href="/generator" data-testid="link-nav-try-free">
              <Button
                className="min-h-[44px] px-6 text-sm font-semibold text-white"
                style={{ backgroundColor: BRAND_ORANGE }}
              >
                免費試用
              </Button>
            </Link>
          </div>
        </div>

        <button
          className="min-[860px]:hidden p-2 text-foreground"
          onClick={() => setIsMobileMenuOpen((open) => !open)}
          data-testid="button-mobile-menu"
          aria-label="開啟選單"
        >
          {isMobileMenuOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="min-[860px]:hidden border-t border-border bg-background">
          <div className="container mx-auto flex flex-col gap-4 px-4 py-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-foreground ${
                  location === link.href ? "text-foreground" : "text-muted-foreground"
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
                data-testid={`link-mobile-nav-${link.label}`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/generator"
              onClick={() => setIsMobileMenuOpen(false)}
              data-testid="link-mobile-nav-try-free"
            >
              <Button
                className="w-full text-white"
                style={{ backgroundColor: BRAND_ORANGE }}
              >
                免費試用
              </Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
