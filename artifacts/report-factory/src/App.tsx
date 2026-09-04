import { useEffect, useRef, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Home } from "@/pages/home";
import { Features } from "@/pages/features";
import { FAQ } from "@/pages/faq";
import { Generator } from "@/pages/generator";
import { PaperSearch } from "@/pages/paper-search";
import { ReportPreview } from "@/pages/report-preview";
import { ResearchProject } from "@/pages/research-project";

const queryClient = new QueryClient();

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/features" component={Features} />
      <Route path="/faq" component={FAQ} />
      <Route path="/generator" component={PaperSearch} />
      <Route path="/search" component={PaperSearch} />
      <Route path="/workspace" component={Generator} />
      <Route path="/research-project" component={ResearchProject} />
      <Route path="/reports/:reportId" component={ReportPreview} />
      <Route path="/preview/:reportId" component={ReportPreview} />
      <Route component={NotFound} />
    </Switch>
  );
}

function pathnameOf(location: string): string {
  return location.split("?")[0] ?? location;
}

function RouteExperienceShell() {
  const [location] = useLocation();
  const reduceMotion = useReducedMotion();
  const pathname = pathnameOf(location);
  const previousPathRef = useRef(pathname);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (previousPathRef.current === pathname) return;
    previousPathRef.current = pathname;

    setVisible(true);
    setProgress(16);

    const timers = [
      window.setTimeout(() => setProgress(38), 90),
      window.setTimeout(() => setProgress(64), 220),
      window.setTimeout(() => setProgress(82), 420),
      window.setTimeout(() => setProgress(100), 680),
      window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 940),
    ];

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [pathname]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] h-1 overflow-hidden">
        <motion.div
          className="route-progress-bar h-full origin-left bg-[linear-gradient(90deg,hsl(var(--primary))_0%,hsl(var(--primary)/0.82)_45%,hsl(18_95%_69%)_100%)]"
          initial={false}
          animate={{
            scaleX: visible ? Math.max(progress / 100, 0.02) : 0,
            opacity: visible ? 1 : 0,
          }}
          transition={{
            scaleX: {
              duration: reduceMotion ? 0.12 : 0.42,
              ease: [0.22, 1, 0.36, 1],
            },
            opacity: {
              duration: reduceMotion ? 0.08 : 0.22,
            },
          }}
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          initial={
            reduceMotion
              ? { opacity: 1 }
              : { opacity: 0, y: 10, filter: "blur(8px)" }
          }
          animate={
            reduceMotion
              ? { opacity: 1 }
              : { opacity: 1, y: 0, filter: "blur(0px)" }
          }
          exit={
            reduceMotion
              ? { opacity: 1 }
              : { opacity: 0, y: -8, filter: "blur(4px)" }
          }
          transition={{
            duration: reduceMotion ? 0.12 : 0.34,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <AppRoutes />
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <RouteExperienceShell />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
