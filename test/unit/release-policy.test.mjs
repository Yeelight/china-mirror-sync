import assert from "node:assert/strict";
import test from "node:test";

import { applyReleaseAssetLimit, selectReleaseAssets } from "../../src/core/release-policy.mjs";

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

test("keeps a deterministic installable subset when a platform limits release assets", () => {
  const names = [
    "checksums.txt", "install.sh", "install.ps1", "metadata.json", "yeelight-home-0.1.21.tgz",
    "yeelight-home-darwin-amd64.tar.gz", "yeelight-home-darwin-arm64.tar.gz",
    "yeelight-home-linux-amd64.tar.gz", "yeelight-home-linux-arm64.tar.gz", "yeelight-home-linux-armv7.tar.gz",
    "yeelight-home-windows-amd64.zip", "yeelight-home-windows-arm64.zip",
    ...Array.from({ length: 7 }, (_, index) => `platform-${index}.sbom.json`),
    "linux-amd64.apk", "linux-amd64.deb", "linux-amd64.rpm", "linux-amd64.pkg.tar.zst",
  ];
  const source = [{ ...release("v1", "2026-07-20T00:00:00Z"), assets: names.map((name) => ({ name, size: 1 })) }];
  const result = applyReleaseAssetLimit(source, new Set(["v1"]), 20);
  const selected = result.releases[0].assets.map(({ name }) => name);

  assert.equal(result.omittedAssetCount, 3);
  assert.equal(selected.length, 20);
  assert.ok(selected.includes("yeelight-home-windows-amd64.zip"));
  assert.ok(selected.includes("yeelight-home-windows-arm64.zip"));
  assert.ok(selected.includes("linux-amd64.deb"));
  assert.ok(!selected.includes("linux-amd64.apk"));
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
