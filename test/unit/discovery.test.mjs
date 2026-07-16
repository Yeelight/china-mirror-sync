import assert from "node:assert/strict";
import test from "node:test";

import { discoverPublicRepositories } from "../../src/core/discovery.mjs";

test("discovers every public repository across GitHub API pages", async () => {
  const requests = [];
  const pages = new Map([
    ["1", {
      repositories: [
        repository({ id: 20, name: "zeta", default_branch: "main" }),
        repository({ id: 10, name: "Alpha", default_branch: "develop", archived: true }),
      ],
      link: '<https://api.github.com/orgs/Yeelight/repos?type=public&per_page=100&page=2>; rel="next"',
    }],
    ["2", {
      repositories: [repository({ id: 30, name: "forked", default_branch: "master", fork: true })],
      link: "",
    }],
  ]);

  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    const page = new URL(url).searchParams.get("page");
    const item = pages.get(page);
    return new Response(JSON.stringify(item.repositories), {
      status: 200,
      headers: item.link ? { link: item.link } : {},
    });
  };

  const repositories = await discoverPublicRepositories({
    organization: "Yeelight",
    token: "github-secret",
    fetchImpl,
  });

  assert.deepEqual(repositories.map((item) => item.name), ["Alpha", "forked", "zeta"]);
  assert.equal(repositories[0].archived, true);
  assert.equal(repositories[1].fork, true);
  assert.equal(repositories[1].defaultBranch, "master");
  assert.equal(repositories[2].githubId, 20);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers.authorization, "Bearer github-secret");
});

test("rejects an unsafe repository name before constructing target URLs", async () => {
  const fetchImpl = async () => new Response(JSON.stringify([
    repository({ id: 1, name: "../escape", default_branch: "main" }),
  ]), { status: 200 });

  await assert.rejects(
    discoverPublicRepositories({ organization: "Yeelight", fetchImpl }),
    /unsafe GitHub repository name/,
  );
});

function repository(overrides) {
  return {
    id: 1,
    node_id: "R_1",
    name: "repo",
    full_name: `Yeelight/${overrides.name || "repo"}`,
    private: false,
    visibility: "public",
    archived: false,
    fork: false,
    description: "Description",
    homepage: "https://example.com",
    topics: ["yeelight"],
    clone_url: `https://github.com/Yeelight/${overrides.name || "repo"}.git`,
    html_url: `https://github.com/Yeelight/${overrides.name || "repo"}`,
    has_wiki: true,
    pushed_at: "2026-07-16T00:00:00Z",
    size: 42,
    ...overrides,
  };
}
