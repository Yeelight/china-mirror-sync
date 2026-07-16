import assert from "node:assert/strict";
import test from "node:test";

import { validateAdapter } from "../../src/platforms/contract.mjs";

test("accepts an adapter that implements the complete platform contract", () => {
  const adapter = completeAdapter();
  assert.equal(validateAdapter(adapter), adapter);
});

test("rejects adapters that silently omit a required capability method", () => {
  const adapter = completeAdapter();
  delete adapter.uploadReleaseAsset;
  assert.throws(() => validateAdapter(adapter), /uploadReleaseAsset/);
});

test("requires explicit supported or unsupported capability values", () => {
  const adapter = completeAdapter();
  adapter.capabilities = () => ({ wiki: "maybe" });
  assert.throws(() => validateAdapter(adapter), /capability wiki/);
});

function completeAdapter() {
  return {
    id: "fixture",
    capabilities: () => ({ wiki: "unsupported", releaseAssets: "supported" }),
    getRepository: async () => null,
    createRepository: async () => ({}),
    updateRepositoryMetadata: async () => ({}),
    gitRemote: () => "https://example.com/repo.git",
    getWikiRemote: () => null,
    listReleases: async () => [],
    createOrUpdateRelease: async () => ({}),
    listReleaseAssets: async () => [],
    uploadReleaseAsset: async () => ({}),
    deleteManagedReleaseAsset: async () => ({}),
    audit: async () => ({}),
  };
}
