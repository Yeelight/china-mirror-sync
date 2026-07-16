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

test("force-replaces unknown same-name assets and deletes target-only assets", () => {
  const sourceReleases = [release("v2", [{ name: "app.zip", size: 20 }])];
  const targetReleases = [release("v2", [
    { id: 7, name: "app.zip", size: 10 },
    { id: 8, name: "target-only.zip", size: 5 },
  ])];

  const plan = planReleaseSync({
    sourceReleases,
    targetReleases,
    selectedTags: new Set(["v2"]),
    managedAssets: {},
  });

  assert.equal(plan.assets[0].action, "replace");
  assert.equal(plan.assets[1].action, "delete");
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

test("deletes target-only releases", () => {
  const plan = planReleaseSync({
    sourceReleases: [release("v2", [])],
    targetReleases: [release("v1", []), release("v2", [])],
    selectedTags: new Set(),
    managedAssets: {},
  });

  assert.equal(plan.releases.at(-1).action, "delete");
  assert.equal(plan.releases.at(-1).tagName, "v1");
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
    listReleases: async () => [{ ...release("v2", []), id: 9, body: "old notes" }],
    listReleaseAssets: async (_repo, item) => {
      calls.push(`assets:${item.tagName}`);
      return item.assets || [];
    },
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
    "assets:v2",
    "release:v2",
    "upload:v2:app.zip:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  ]);
  assert.equal(result.managedAssets["v2/app.zip"].size, 3);
});

test("uploads release assets with bounded parallelism", async () => {
  let active = 0;
  let peak = 0;
  const assets = Array.from({ length: 8 }, (_, index) => ({
    id: index,
    name: `asset-${index}.zip`,
    size: 3,
    downloadUrl: `https://example.com/asset-${index}.zip`,
  }));
  const source = [release("v2", assets)];
  const adapter = {
    listReleases: async () => [release("v2", [])],
    listReleaseAssets: async () => [],
    createOrUpdateRelease: async () => { throw new Error("metadata is already aligned"); },
    uploadReleaseAsset: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    },
    deleteManagedReleaseAsset: async () => {},
  };

  const result = await executeReleaseSync({
    sourceRepository: { name: "demo" },
    sourceReleases: source,
    selectedTags: new Set(["v2"]),
    managedAssets: {},
    adapter,
    fetchImpl: async () => new Response("abc", { status: 200 }),
  });

  assert.equal(Object.keys(result.managedAssets).length, 8);
  assert.ok(peak > 1, `expected parallel uploads, observed ${peak}`);
  assert.ok(peak <= 4, `parallel upload limit exceeded: ${peak}`);
});

test("deletes target-only assets before uploading replacements for capped platforms", async () => {
  const calls = [];
  const source = [release("v2", [{
    name: "wanted.zip",
    size: 3,
    downloadUrl: "https://example.com/wanted.zip",
  }])];
  const adapter = {
    releaseAssetConcurrency: 1,
    listReleases: async () => [release("v2", [])],
    listReleaseAssets: async () => [{ id: 9, name: "extra.zip", size: 3 }],
    createOrUpdateRelease: async () => { throw new Error("metadata is already aligned"); },
    deleteManagedReleaseAsset: async () => calls.push("delete:extra.zip"),
    uploadReleaseAsset: async () => calls.push("upload:wanted.zip"),
  };

  await executeReleaseSync({
    sourceRepository: { name: "demo" },
    sourceReleases: source,
    selectedTags: new Set(["v2"]),
    managedAssets: {},
    adapter,
    fetchImpl: async () => new Response("abc", { status: 200 }),
  });

  assert.deepEqual(calls, ["delete:extra.zip", "upload:wanted.zip"]);
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
