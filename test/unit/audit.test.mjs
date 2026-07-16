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
  });

  assert.equal(result.dimensions.defaultBranch.status, "aligned");
  assert.equal(result.dimensions.refs.status, "lagging");
  assert.equal(result.dimensions.releaseAssets.status, "lagging");
  assert.equal(result.dimensions.wiki.status, "unsupported");
  assert.equal(result.status, "lagging");
});
