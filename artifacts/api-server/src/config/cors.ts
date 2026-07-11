const FRONTEND_PRODUCTION_ORIGINS = new Set([
  "https://researchforge-preview.vercel.app",
  "https://researchforge-preview-yuz1ove-s-projects.vercel.app",
  "https://researchforge-preview-kuanyunimo-1227-yuz1ove-s-projects.vercel.app",
]);

const RESEARCHFORGE_PREVIEW_HOST =
  /^researchforge-preview-[a-z0-9]+-yuz1ove-s-projects\.vercel\.app$/;

/**
 * Restrict browser access to this application's deployed frontend and its
 * Vercel preview deployments. The deployment-specific hostname is generated
 * by Vercel, but the project and team portions remain fixed.
 */
export function isAllowedResearchForgeOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.pathname !== "/"
  ) {
    return false;
  }

  if (FRONTEND_PRODUCTION_ORIGINS.has(origin)) return true;

  if (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  ) {
    return true;
  }

  return (
    url.protocol === "https:" && RESEARCHFORGE_PREVIEW_HOST.test(url.hostname)
  );
}
