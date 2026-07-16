import assert from "node:assert/strict";
import test from "node:test";

import { auditMirrors } from "../../src/core/runner.mjs";

test("builds a read-only dimension audit for every selected repository", async () => {
  const calls = [];
  const result = await auditMirrors({
    organization: "Yeelight",
    platforms: [{ id: "fixture" }],
    discoverRepositories: async () => [{
      githubId: 1,
      name: "demo",
      cloneUrl: "https://github.com/Yeelight/demo.git",
      defaultBranch: "main",
    }],
    createAdapter: () => ({
      capabilities: () => ({ metadata: "supported", wiki: "unsupported", releases: "supported" }),
      getRepository: async () => ({ defaultBranch: "main" }),
      gitRemote: () => "https://target/demo.git",
      listReleases: async () => [{ id: 2, tagName: "v1", name: "v1", body: "", prerelease: false }],
      listReleaseAssets: async () => [{ name: "demo.zip", size: 10 }],
    }),
    listRefs: async (url) => {
      calls.push(`refs:${url}`);
      return { "refs/heads/main": "oid" };
    },
    listSourceReleases: async () => [{
      tagName: "v1",
      name: "v1",
      body: "",
      prerelease: false,
      publishedAt: "2026-07-16T00:00:00Z",
      assets: [{ name: "demo.zip", size: 10 }],
    }],
    selectAssetTags: () => new Set(["v1"]),
    readState: async () => ({ refs: { "refs/heads/main": "oid" } }),
  });

  assert.equal(result.audits.length, 1);
  assert.equal(result.audits[0].status, "unsupported");
  assert.deepEqual(result.summary, { unsupported: 1 });
  assert.deepEqual(calls, [
    "refs:https://github.com/Yeelight/demo.git",
    "refs:https://target/demo.git",
  ]);
});

test("reports a missing target without attempting target reads", async () => {
  const result = await auditMirrors({
    organization: "Yeelight",
    platforms: [{ id: "fixture" }],
    discoverRepositories: async () => [{ githubId: 1, name: "missing", cloneUrl: "source", defaultBranch: "main" }],
    createAdapter: () => ({
      capabilities: () => ({ metadata: "supported", wiki: "unsupported", releases: "supported" }),
      getRepository: async () => null,
    }),
    listRefs: async () => { throw new Error("must not list refs for a missing target"); },
    listSourceReleases: async () => [],
    selectAssetTags: () => new Set(),
    readState: async () => null,
  });

  assert.equal(result.audits[0].status, "failed");
  assert.equal(result.audits[0].dimensions.repository.reason, "missing target");
  assert.deepEqual(result.summary, { failed: 1 });
});
