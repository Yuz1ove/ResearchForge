# ResearchForge R25.2 Dual-Mode Product Quality Assurance
## Product Convergence & User Experience Architecture Audit

### 1. Architectural Unification Overview
Prior to R25.2, ResearchForge had multiple powerful but isolated subsystems:
- Autonomous topic grounding and evidence generation (Scenario A)
- Existing report parsing, claim extraction, and verification (Scenario B)
- Experimental CLI tools and evaluation scripts

In R25.2, the codebase converged into a unified dual-mode architecture centered around human workflows:
- **`home.tsx`**: Re-architected as an intuitive entry hub presenting two clear choices:
  - **[建立研究報告]**: Autonomous research from topic input
  - **[驗證既有報告]**: Rigorous verification of uploaded documents
- **`research-project.tsx`**: Serves as the consolidated research workspace with seamless tabbed switching between `[研究產製計畫 (Scenario A)]` and `[既有報告審查 (Scenario B)]`.
- **Shared Interactive Inspector**: A unified `Citation & Evidence Inspector` component that serves both modes:
  - In Scenario A: Inspects retrieved scholarly sources, DOI links, and abstract evidence spans.
  - In Scenario B: Inspects parsed document claims, verified verdicts, confidence scores, supporting/contradicting spans, and suggested corrections.

### 2. Jargon Elimination
All internal engineering labels were systematically removed from human-visible UI:
- Replaced references to `R22`, `R23`, `R24`, `R25.1` with descriptive product terminology.
- Replaced `Mode B schemas`, `canonical admission`, and `grounding pipeline` with `既有報告審查`, `實證准入審查`, and `可追溯研究產製`.
- Preserved developer diagnostics in collapsed debug drawers and structured telemetry logs only.

### 3. Responsive Layout Architecture
The product was tested across three standard viewports:
- **Desktop (1440 x 900)**: 3-pane parallel layout (Sub-questions & Sources | Report Preview | Citation Inspector).
- **Tablet (1024 x 768)**: 3-pane balanced view with responsive card wrapping and scroll synchronization.
- **Mobile (390 x 844)**: Streamlined single-column reading view with floating badge indicator and smooth slide-over drawer for Citation & Evidence inspection.

All viewports verified via Playwright with 13 captured screenshots.
