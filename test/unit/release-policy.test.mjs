import assert from "node:assert/strict";
import test from "node:test";

import { selectReleaseAssets } from "../../src/core/release-policy.mjs";

test("selects the latest stable release plus every release published after the cutoff", () => {
  const releases = [
    release("v1.0.0", "2026-01-01T00:00:00Z"),
    release("v1.1.0", "2026-02-01T00:00:00Z"),
    release("v1.2.0-beta.1", "2026-07-20T00:00:00Z", { prerelease: true }),
    release("v1.2.0", "2026-07-21T00:00:00Z"),
    release("draft", "2026-07-22T00:00:00Z", { draft: true }),
  ];

  const selected = selectReleaseAssets(releases, {
    assetSyncFrom: "2026-07-16T00:00:00Z",
  });

  assert.deepEqual([...selected].sort(), ["v1.2.0", "v1.2.0-beta.1"]);
});

test("selects an older latest stable release when no release is newer than the cutoff", () => {
  const selected = selectReleaseAssets([
    release("v1.0.0", "2026-01-01T00:00:00Z"),
    release("v1.1.0", "2026-02-01T00:00:00Z"),
  ], { assetSyncFrom: "2026-07-16T00:00:00Z" });

  assert.deepEqual([...selected], ["v1.1.0"]);
});

function release(tagName, publishedAt, overrides = {}) {
  return {
    tagName,
    publishedAt,
    draft: false,
    prerelease: false,
    assets: [{ name: `${tagName}.zip`, size: 100 }],
    ...overrides,
  };
}
