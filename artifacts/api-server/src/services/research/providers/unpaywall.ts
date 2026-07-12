export const UNPAYWALL_PROVIDER = {
  name: "Unpaywall",
  envFlag: "ENABLE_UNPAYWALL",
  emailEnv: "UNPAYWALL_EMAIL",
  defaultEndpoint: "https://api.unpaywall.org/v2",
} as const;
