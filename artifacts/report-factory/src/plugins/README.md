# Plugin Contract V1

This folder defines a small plugin contract for Report Factory modules. V1 now includes a minimal execution path for the Research Writing Orchestrator and the DOCX export plugin.

## Files

- `contract.ts` defines plugin kinds, statuses, manifests, capabilities, registry entries, the shared `report-document-v1` schema, and a manifest guard.
- `builtInPlugins.ts` lists stable built-in plugin manifests for orchestrator, source, citation, and export modules.
- `registry.ts` provides a simple in-memory registry with lookup, listing, kind filtering, enabled filtering, snapshot helpers, and a small `execute(pluginId, input)` bridge.
- `docxPlugin.ts` accepts the shared report document schema, adapts it to the existing report export shape, and delegates download mode to the existing DOCX exporter.

## Goals

- Give Writer, Source, Citation, Export, Quality, and Orchestrator modules a shared contract.
- Keep plugin metadata JSON-friendly and deterministic.
- Avoid network calls or fabricated research evidence in V1.
- Let future modules import the registry without creating another plugin system.

## Research Writing Orchestrator And DOCX Registration

`builtInPlugins.ts` registers `research-writing-orchestrator-v1` and `export-pipeline-v1` with status `alpha`. Both plugins are discoverable through:

```ts
import { defaultPluginRegistry } from "./registry.ts";

const entry = defaultPluginRegistry.get("research-writing-orchestrator-v1");
const docx = defaultPluginRegistry.get("export-pipeline-v1");
const orchestrators = defaultPluginRegistry.listByKind("orchestrator");
```

`registry.ts` attaches the rule-based orchestrator function and DOCX plugin adapter as the built-in execution handlers for these plugin ids.

## Execution Path

The shortest working integration path lives in `../reportFactory/runResearchWritingFlow.ts`:

```ts
import { runResearchWritingFlow } from "../reportFactory/runResearchWritingFlow.ts";

await runResearchWritingFlow({
  topic: "短影音使用對高中生注意力與睡眠品質之影響",
  reportType: "研究報告",
  outputFormat: "docx",
});
```

The flow is:

1. Accept topic input.
2. Execute `research-writing-orchestrator-v1` through the plugin registry.
3. Normalize the orchestrator plan into structured report sections.
4. Build a shared `report-document-v1` document.
5. Execute `export-pipeline-v1` when `outputFormat` is `docx`.
6. The DOCX plugin adapts the shared schema to the existing `GeneratedReport` shape and calls the existing DOCX exporter.

The current generator page uses this flow for the default research-structure path. The DOCX download button also wraps the current report in `report-document-v1` before calling the DOCX plugin, so existing DOCX behavior remains in `../lib/exportReport.ts`.

## Non-Goals

- No runtime plugin loader.
- No LLM calls.
- No source retrieval, citation generation, or export execution.
- No fabricated citation metadata or research evidence.
- No full report body generation.
- No dynamic third-party plugin loading.

## Current Limitations

- DOCX export is connected through a small adapter, not a new exporter.
- The orchestrator remains rule-based and deterministic.
- Missing citations are marked with placeholders and warnings only.
- Empty report documents produce a safe fallback DOCX instead of blocking the page.

## Example

```ts
import { defaultPluginRegistry } from "./registry.ts";

const sourcePlugins = defaultPluginRegistry.listByKind("source");
const snapshot = defaultPluginRegistry.snapshot();
```
