import assert from "node:assert/strict";
import test from "node:test";
import { deriveSourceSearchUiState } from "./sourceSearchUiState.ts";

test("deriveSourceSearchUiState keeps idle before any search starts", () => {
  assert.equal(
    deriveSourceSearchUiState({
      isSearchingSources: false,
      sourceCount: 0,
      sourceSearchStatus: "idle",
      sourceSearchMessage: "",
      backendMessage: "",
    }),
    "idle",
  );
});

test("deriveSourceSearchUiState stays loading while search is pending", () => {
  assert.equal(
    deriveSourceSearchUiState({
      isSearchingSources: true,
      sourceCount: 0,
      sourceSearchStatus: "loading",
      sourceSearchMessage: "",
      backendMessage: "",
    }),
    "loading",
  );
});

test("deriveSourceSearchUiState returns empty only after a finished zero-result search", () => {
  assert.equal(
    deriveSourceSearchUiState({
      isSearchingSources: false,
      sourceCount: 0,
      sourceSearchStatus: "done",
      sourceSearchMessage: "目前沒有取得有效來源",
      backendMessage: "",
    }),
    "empty",
  );
});

test("deriveSourceSearchUiState returns failed for explicit error states", () => {
  assert.equal(
    deriveSourceSearchUiState({
      isSearchingSources: false,
      sourceCount: 0,
      sourceSearchStatus: "error",
      sourceSearchMessage: "來源搜尋服務逾時",
      backendMessage: "",
    }),
    "failed",
  );
});

test("create and polling errors clear a stale loading indicator", () => {
  for (const groundingRequestState of ["job_create_failed", "job_poll_failed"] as const) {
    assert.equal(
      deriveSourceSearchUiState({
        isSearchingSources: true,
        sourceCount: 0,
        sourceSearchStatus: "loading",
        groundingRequestState,
      }),
      "failed",
    );
  }
});

test("provider failure and successful zero-result search have different UI states", () => {
  assert.equal(
    deriveSourceSearchUiState({
      isSearchingSources: false,
      sourceCount: 0,
      sourceSearchStatus: "empty",
      groundingRequestState: "all_providers_failed",
    }),
    "failed",
  );
  assert.equal(
    deriveSourceSearchUiState({
      isSearchingSources: false,
      sourceCount: 0,
      sourceSearchStatus: "empty",
      groundingRequestState: "no_results_after_expansion",
    }),
    "empty",
  );
});

test("deriveSourceSearchUiState returns success when sources exist", () => {
  assert.equal(
    deriveSourceSearchUiState({
      isSearchingSources: false,
      sourceCount: 3,
      sourceSearchStatus: "done",
      sourceSearchMessage: "",
      backendMessage: "",
    }),
    "success",
  );
});
