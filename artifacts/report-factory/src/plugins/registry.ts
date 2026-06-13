import { builtInPlugins } from "./builtInPlugins.ts";
import {
  isReportFactoryPluginManifest,
  type PluginRegistryEntry,
  type PluginRegistrySnapshot,
  type ReportFactoryPluginExecute,
  type ReportFactoryPluginKind,
  type ReportFactoryPluginManifest,
} from "./contract.ts";
import { runDocxPlugin } from "./docxPlugin.ts";
import { runResearchWritingOrchestrator } from "../orchestrator/researchWritingOrchestrator.ts";

const builtInExecutors: Record<string, ReportFactoryPluginExecute> = {
  "research-writing-orchestrator-v1": runResearchWritingOrchestrator,
  "export-pipeline-v1": runDocxPlugin,
};

export class PluginRegistry {
  private readonly entries = new Map<string, PluginRegistryEntry>();

  constructor(plugins: readonly ReportFactoryPluginManifest[] = builtInPlugins) {
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  register(
    manifest: ReportFactoryPluginManifest,
    enabled = manifest.status !== "disabled",
    execute = builtInExecutors[manifest.id],
  ): void {
    if (!isReportFactoryPluginManifest(manifest)) {
      throw new Error("Invalid Report Factory plugin manifest.");
    }

    if (this.entries.has(manifest.id)) {
      throw new Error(`Duplicate Report Factory plugin id: ${manifest.id}`);
    }

    this.entries.set(manifest.id, {
      manifest,
      enabled,
      execute,
    });
  }

  get(pluginId: string): PluginRegistryEntry | undefined {
    return this.entries.get(pluginId);
  }

  list(): PluginRegistryEntry[] {
    return Array.from(this.entries.values());
  }

  listByKind(kind: ReportFactoryPluginKind): PluginRegistryEntry[] {
    return this.list().filter((entry) => entry.manifest.kind === kind);
  }

  enabled(): PluginRegistryEntry[] {
    return this.list().filter((entry) => entry.enabled);
  }

  async execute(pluginId: string, input: unknown): Promise<unknown> {
    const entry = this.get(pluginId);
    if (!entry) {
      throw new Error(`Report Factory plugin not found: ${pluginId}`);
    }

    if (!entry.enabled) {
      throw new Error(`Report Factory plugin is disabled: ${pluginId}`);
    }

    if (!entry.execute) {
      throw new Error(`Report Factory plugin has no execution handler: ${pluginId}`);
    }

    return entry.execute(input);
  }

  snapshot(): PluginRegistrySnapshot {
    const plugins = this.list();

    return {
      plugins,
      enabledPluginIds: plugins.filter((entry) => entry.enabled).map((entry) => entry.manifest.id),
      disabledPluginIds: plugins.filter((entry) => !entry.enabled).map((entry) => entry.manifest.id),
    };
  }
}

export const defaultPluginRegistry = new PluginRegistry();

export function createPluginRegistry(plugins: readonly ReportFactoryPluginManifest[] = builtInPlugins): PluginRegistry {
  return new PluginRegistry(plugins);
}
