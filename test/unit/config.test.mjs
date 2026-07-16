import assert from "node:assert/strict";
import test from "node:test";

import { loadConfiguration } from "../../src/core/config.mjs";

test("loads three unique target platforms without embedding tokens", async () => {
  const configuration = await loadConfiguration(new URL("../../config/", import.meta.url));

  assert.deepEqual(configuration.platforms.map((platform) => platform.id), [
    "gitee",
    "gitcode",
    "gitlab-com",
  ]);
  assert.equal(configuration.policy.source.organization, "Yeelight");
  assert.equal(configuration.policy.releases.initialAssets, "latest-stable");
  assert.doesNotMatch(JSON.stringify(configuration), /token\s*[:=]/i);
});

test("rejects duplicate platform ids", async () => {
  const readFile = async (url) => url.pathname.endsWith("platforms.json")
    ? JSON.stringify({ platforms: [{ id: "same" }, { id: "same" }] })
    : JSON.stringify(validPolicy());

  await assert.rejects(loadConfiguration(new URL("file:///config/"), { readFile }), /duplicate platform id/);
});

function validPolicy() {
  return {
    source: { organization: "Yeelight" },
    schedule: { assetSyncFrom: "2026-07-16T00:00:00Z" },
    releases: { initialAssets: "latest-stable" },
    git: { namespaces: ["refs/heads/*"] },
  };
}
