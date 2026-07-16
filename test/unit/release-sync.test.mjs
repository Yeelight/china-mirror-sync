import assert from "node:assert/strict";
import test from "node:test";

import { executeReleaseSync, planReleaseSync } from "../../src/core/release-sync.mjs";

test("plans all release metadata but only selected release assets", () => {
  const sourceReleases = [
    release("v1", [{ name: "old.zip", size: 1 }]),
    release("v2", [{ name: "new.zip", size: 2 }]),
  ];
  const targetReleases = [release("v1", []), release("v2", [])];
  const plan = planReleaseSync({
    sourceReleases,
    targetReleases,
    selectedTags: new Set(["v2"]),
    managedAssets: {},
  });

  assert.deepEqual(plan.releases.map((item) => item.tagName), ["v1", "v2"]);
  assert.deepEqual(plan.assets, [{ action: "upload", tagName: "v2", asset: sourceReleases[1].assets[0] }]);
});

test("blocks unknown same-name assets instead of overwriting them", () => {
  const sourceReleases = [release("v2", [{ name: "app.zip", size: 20 }])];
  const targetReleases = [release("v2", [{ id: 7, name: "app.zip", size: 10 }])];

  assert.throws(() => planReleaseSync({
    sourceReleases,
    targetReleases,
    selectedTags: new Set(["v2"]),
    managedAssets: {},
  }), /unmanaged release asset drift.*v2\/app.zip/);
});

test("replaces a changed asset only when the target still matches managed state", () => {
  const sourceReleases = [release("v2", [{ name: "app.zip", size: 20 }])];
  const targetReleases = [release("v2", [{ id: 7, name: "app.zip", size: 10 }])];
  const plan = planReleaseSync({
    sourceReleases,
    targetReleases,
    selectedTags: new Set(["v2"]),
    managedAssets: { "v2/app.zip": { size: 10, sha256: "old" } },
  });

  assert.equal(plan.assets[0].action, "replace");
  assert.equal(plan.assets[0].targetAsset.id, 7);
});

test("executes metadata and verified asset uploads idempotently", async () => {
  const calls = [];
  const source = [release("v2", [{
    id: 3,
    name: "app.zip",
    size: 3,
    digest: "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    downloadUrl: "https://example.com/app.zip",
  }])];
  const adapter = {
    listReleases: async () => [],
    createOrUpdateRelease: async (_repo, item) => {
      calls.push(`release:${item.tagName}`);
      return { id: 9, tagName: item.tagName, assets: [] };
    },
    uploadReleaseAsset: async (_repo, item, asset) => {
      calls.push(`upload:${item.tagName}:${asset.name}:${asset.sha256}`);
      return { id: 10, name: asset.name, size: asset.size };
    },
    deleteManagedReleaseAsset: async () => calls.push("delete"),
  };

  const result = await executeReleaseSync({
    sourceRepository: { name: "demo" },
    sourceReleases: source,
    selectedTags: new Set(["v2"]),
    managedAssets: {},
    adapter,
    fetchImpl: async () => new Response("abc", { status: 200 }),
  });

  assert.deepEqual(calls, [
    "release:v2",
    "upload:v2:app.zip:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  ]);
  assert.equal(result.managedAssets["v2/app.zip"].size, 3);
});

function release(tagName, assets) {
  return {
    tagName,
    name: tagName,
    body: `${tagName} notes`,
    publishedAt: "2026-07-20T00:00:00Z",
    prerelease: false,
    draft: false,
    assets,
  };
}
