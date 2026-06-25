import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
} else {
  console.warn(
    "VITE_API_BASE_URL is not configured; relative /api calls require a same-origin API server.",
  );
}

createRoot(document.getElementById("root")!).render(<App />);
