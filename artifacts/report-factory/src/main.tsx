import { ConvexProvider, ConvexReactClient } from "convex/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

if (!convexUrl) {
  console.warn(
    "VITE_CONVEX_URL is not set. ResearchForge will run without the Convex data layer.",
  );
}

createRoot(document.getElementById("root")!).render(
  convexClient ? (
    <ConvexProvider client={convexClient}>
      <App />
    </ConvexProvider>
  ) : (
    <App />
  ),
);
