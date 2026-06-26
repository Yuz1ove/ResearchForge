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
