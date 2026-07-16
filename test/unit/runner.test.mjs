import assert from "node:assert/strict";
import test from "node:test";

import { planMirrors } from "../../src/core/runner.mjs";

test("plans every discovered public repository for each selected platform", async () => {
  const result = await planMirrors({
    organization: "Yeelight",
    platforms: [{ id: "one" }, { id: "two" }],
    discoverRepositories: async () => [repo(1, "alpha"), repo(2, "beta")],
    createAdapter: (platform) => ({
      id: platform.id,
      getRepository: async (source) => source.name === "alpha" ? { name: source.name } : null,
      gitRemote: (source) => `${platform.id}/${source.name}`,
    }),
    listRefs: async (url) => url.includes("github.com") || url.endsWith("alpha")
      ? { "refs/heads/main": "same" }
      : {},
    readState: async () => null,
  });

  assert.equal(result.repositories.length, 2);
  assert.deepEqual(result.plans.map((item) => `${item.platform}/${item.repository}/${item.status}`), [
    "one/alpha/adopt",
    "one/beta/create",
    "two/alpha/adopt",
    "two/beta/create",
  ]);
});

test("supports exact repository and platform filters", async () => {
  const result = await planMirrors({
    organization: "Yeelight",
    platforms: [{ id: "one" }, { id: "two" }],
    repositoryFilter: "beta",
    platformFilter: "two",
    discoverRepositories: async () => [repo(1, "alpha"), repo(2, "beta")],
    createAdapter: (platform) => ({
      id: platform.id,
      getRepository: async () => null,
      gitRemote: () => "target",
    }),
    listRefs: async () => ({ "refs/heads/main": "same" }),
    readState: async () => null,
  });

  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0].repository, "beta");
  assert.equal(result.plans[0].platform, "two");
});

function repo(githubId, name) {
  return { githubId, name, cloneUrl: `https://github.com/Yeelight/${name}.git` };
}
