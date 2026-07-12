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
  groundingRequestState?:
    | "job_create_failed"
    | "job_poll_failed"
    | "all_providers_failed"
    | "no_results_after_expansion";
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
  if (
    input.groundingRequestState === "job_create_failed" ||
    input.groundingRequestState === "job_poll_failed" ||
    input.groundingRequestState === "all_providers_failed"
  ) {
    return "failed";
  }

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
