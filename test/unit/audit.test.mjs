import assert from "node:assert/strict";
import test from "node:test";

import { auditRepository } from "../../src/core/audit.mjs";

test("reports aligned lagging drifted unsupported and failed dimensions", () => {
  const result = auditRepository({
    source: {
      defaultBranch: "main",
      refs: { "refs/heads/main": "source", "refs/tags/v1": "tag" },
      releases: [{ tagName: "v1", assets: [{ name: "app.zip", size: 10 }] }],
    },
    target: {
      defaultBranch: "main",
      refs: { "refs/heads/main": "old", "refs/tags/v1": "tag" },
      releases: [{ tagName: "v1", assets: [] }],
    },
    previous: { refs: { "refs/heads/main": "old", "refs/tags/v1": "tag" } },
    capabilities: { metadata: "supported", wiki: "unsupported", releases: "supported" },
    selectedTags: new Set(["v1"]),
  });

  assert.equal(result.dimensions.defaultBranch.status, "aligned");
  assert.equal(result.dimensions.refs.status, "lagging");
  assert.equal(result.dimensions.releaseAssets.status, "lagging");
  assert.equal(result.dimensions.releases.status, "aligned");
  assert.equal(result.dimensions.wiki.status, "unsupported");
  assert.equal(result.status, "lagging");
});

test("audits release metadata separately and ignores unselected historical assets", () => {
  const result = auditRepository({
    source: {
      defaultBranch: "main",
      refs: { "refs/heads/main": "source" },
      releases: [
        { tagName: "v1", name: "v1", body: "old", prerelease: false, assets: [{ name: "old.zip", size: 10 }] },
        { tagName: "v2", name: "v2", body: "new", prerelease: false, assets: [{ name: "new.zip", size: 20 }] },
      ],
    },
    target: {
      defaultBranch: "main",
      refs: { "refs/heads/main": "source" },
      releases: [
        { tagName: "v1", name: "v1", body: "changed", prerelease: false, assets: [] },
        { tagName: "v2", name: "v2", body: "new", prerelease: false, assets: [{ name: "new.zip", size: 20 }] },
      ],
    },
    previous: { refs: { "refs/heads/main": "source" } },
    capabilities: { metadata: "supported", wiki: "supported", releases: "supported" },
    selectedTags: new Set(["v2"]),
  });

  assert.deepEqual(result.dimensions.releases, { status: "drifted", reason: "v1" });
  assert.deepEqual(result.dimensions.releaseAssets, { status: "aligned" });
  assert.equal(result.status, "drifted");
});

test("accepts the canonical fallback required by platforms that reject empty release bodies", () => {
  const sourceRelease = {
    tagName: "v1",
    name: "v1",
    body: "",
    prerelease: false,
    canonicalUrl: "https://github.com/Yeelight/demo/releases/tag/v1",
    assets: [],
  };
  const result = auditRepository({
    source: { defaultBranch: "main", refs: {}, releases: [sourceRelease] },
    target: {
      defaultBranch: "main",
      refs: {},
      releases: [{ ...sourceRelease, body: `Canonical release: ${sourceRelease.canonicalUrl}` }],
    },
    capabilities: { metadata: "supported", wiki: "unsupported", releases: "supported" },
  });

  assert.equal(result.dimensions.releases.status, "aligned");
});
