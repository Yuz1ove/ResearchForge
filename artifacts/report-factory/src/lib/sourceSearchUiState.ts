export type SourceSearchUiState =
  | "idle"
  | "loading"
  | "success"
  | "empty"
  | "failed";

export type SourceSearchUiStateInput = {
  isSearchingSources: boolean;
  sourceCount: number;
  sourceSearchStatus: "idle" | "loading" | "done" | "empty" | "error";
  sourceSearchMessage?: string;
  backendMessage?: string;
};

function hasProviderTimeoutMessage(value: string | null | undefined): boolean {
  if (!value) return false;
  return /timed out|timeout|逾時/i.test(value);
}

export function deriveSourceSearchUiState(
  input: SourceSearchUiStateInput,
): SourceSearchUiState {
  if (input.isSearchingSources || input.sourceSearchStatus === "loading") {
    return "loading";
  }

  if (input.sourceSearchStatus === "idle") {
    return "idle";
  }

  if (input.sourceCount > 0) {
    return "success";
  }

  const hasProviderTimeout =
    hasProviderTimeoutMessage(input.sourceSearchMessage) ||
    hasProviderTimeoutMessage(input.backendMessage);

  if (input.sourceSearchStatus === "error" || hasProviderTimeout) {
    return "failed";
  }

  if (input.sourceSearchStatus === "empty" || input.sourceSearchStatus === "done") {
    return "empty";
  }

  return "idle";
}
