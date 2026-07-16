import assert from "node:assert/strict";
import test from "node:test";

import { synchronizeMirrors } from "../../src/core/runner.mjs";

test("adopts aligned repositories and creates only missing targets", async () => {
  const calls = [];
  const repositories = [repo(1, "aligned"), repo(2, "missing")];
  const result = await synchronizeMirrors({
    organization: "Yeelight",
    platforms: [{ id: "fixture" }],
    discoverRepositories: async () => repositories,
    createAdapter: () => ({
      id: "fixture",
      getRepository: async (source) => source.name === "aligned" ? { id: 1, name: source.name } : null,
      createRepository: async (source) => {
        calls.push(`create:${source.name}`);
        return { id: 2, name: source.name };
      },
      updateRepositoryMetadata: async (source) => calls.push(`metadata:${source.name}`),
      gitRemote: (source) => `target/${source.name}`,
    }),
    syncGit: async ({ sourceUrl, previousRefs }) => {
      calls.push(`git:${sourceUrl}:${previousRefs === null ? "adopt" : "new"}`);
      return { status: previousRefs === null ? "adopted" : "updated", sourceRefs: { "refs/heads/main": "oid" }, changes: [] };
    },
    syncReleases: async ({ source, managedAssets }) => {
      calls.push(`releases:${source.name}:${Object.keys(managedAssets).length}`);
      return { managedAssets: { [`v1/${source.name}.zip`]: { size: 1 } } };
    },
    readState: async () => null,
    writeState: async (platform, id, state) => calls.push(`state:${platform}:${id}:${state.refs["refs/heads/main"]}`),
  });

  assert.deepEqual(result.summary, { adopted: 1, updated: 1 });
  assert.deepEqual(calls, [
    "git:https://github.com/Yeelight/aligned.git:adopt",
    "metadata:aligned",
    "releases:aligned:0",
    "state:fixture:1:oid",
    "create:missing",
    "git:https://github.com/Yeelight/missing.git:new",
    "metadata:missing",
    "releases:missing:0",
    "state:fixture:2:oid",
  ]);
});

function repo(githubId, name) {
  return { githubId, name, cloneUrl: `https://github.com/Yeelight/${name}.git` };
}
