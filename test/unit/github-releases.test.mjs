import assert from "node:assert/strict";
import test from "node:test";

import { listGitHubReleases } from "../../src/core/github-releases.mjs";

test("normalizes GitHub releases and assets across pages", async () => {
  const fetchImpl = async (url) => {
    const page = new URL(url).searchParams.get("page");
    const releases = page === "1" ? [release(1, "v1")] : [release(2, "v2")];
    return new Response(JSON.stringify(releases), {
      headers: page === "1" ? { link: '<https://api.github.com/repos/Yeelight/demo/releases?per_page=100&page=2>; rel="next"' } : {},
    });
  };

  const releases = await listGitHubReleases({ owner: "Yeelight", repository: "demo", fetchImpl });

  assert.deepEqual(releases.map((item) => item.tagName), ["v1", "v2"]);
  assert.equal(releases[0].assets[0].downloadUrl, "https://example.com/v1.zip");
  assert.equal(releases[0].canonicalUrl, "https://github.com/Yeelight/demo/releases/tag/v1");
});

function release(id, tag) {
  return {
    id,
    tag_name: tag,
    name: tag,
    body: "notes",
    html_url: `https://github.com/Yeelight/demo/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    created_at: "2026-07-20T00:00:00Z",
    published_at: "2026-07-20T00:00:00Z",
    target_commitish: "main",
    assets: [{ id, name: `${tag}.zip`, size: 10, browser_download_url: `https://example.com/${tag}.zip`, digest: "sha256:abcd" }],
  };
}
