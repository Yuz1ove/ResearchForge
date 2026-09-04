# ResearchForge R25.2 Provider Resilience QA
## Scholarly Provider Degradation & Seam Reliability Audit

### 1. Provider Landscape & Status
ResearchForge integrates three primary scholarly academic providers:
1. **OpenAlex**: Global scholarly works and inverted index abstracts.
   - Anonymous access frequently returns HTTP 429 (`x-ratelimit-remaining: 0`).
2. **Crossref**: Primary DOI authority and publisher registry.
   - Highly available metadata; abstracts often absent or restricted.
3. **Semantic Scholar**: S2 Graph API with comprehensive scholarly abstracts.
   - Rate limits requests with URI-encoded slashes or generic headers.

### 2. Resilience Architecture & Cascading Strategy
In `artifacts/api-server/src/services/research/citation-resolver.ts` and `source-retrieval.ts`:
- **Clean DOI Paths**: Pass unencoded `/graph/v1/paper/${doi}` with standard scholarly user-agent (`ResearchForge/1.0 (mailto:kuanyunimo@gmail.com)`).
- **Independent Timeout Controllers**: Each fallback step creates a fresh `AbortController` preventing cross-provider abortion leakage.
- **Dynamic Seam Fallback**:
  - Primary lookup: OpenAlex Works API.
  - On HTTP 429 or timeout: Seamlessly cascade to Crossref.
  - If Crossref returns metadata without abstract: Immediately query Semantic Scholar API.
  - If all external providers fail: Rely on institutional and official registry seeds without crashing.

### 3. Live Seam Verification
During the execution of Scenario A (`塑膠微粒對海洋生物的影響`):
```text
Semantic Scholar、OpenAlex 發生 HTTP 429 或 rate limit；已改用 Crossref，目前保留 26 筆可審查來源。
```
- Total candidates retrieved: 26.
- Admitted to review: 26.
- Unhandled exceptions: 0.
- Faked fixtures masquerading as live: 0.
